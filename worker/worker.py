"""
AI Task Processing Worker
Consumes jobs from Redis queue, processes text operations,
and updates task status directly in MongoDB.
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timezone

import redis
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

# --------------- Logging Setup ---------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("worker")

# --------------- Configuration ---------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/ai_task_platform")
QUEUE_NAME = "task_queue"
POLL_TIMEOUT = 5  # seconds for BLPOP timeout

# --------------- Connections ---------------
def connect_redis():
    """Connect to Redis with retry logic."""
    max_retries = 10
    for attempt in range(1, max_retries + 1):
        try:
            client = redis.from_url(REDIS_URL, decode_responses=True)
            client.ping()
            logger.info("✅ Connected to Redis")
            return client
        except redis.ConnectionError as e:
            logger.warning(f"Redis connection attempt {attempt}/{max_retries} failed: {e}")
            time.sleep(min(2 ** attempt, 30))
    logger.error("❌ Could not connect to Redis after retries")
    sys.exit(1)


def connect_mongo():
    """Connect to MongoDB with retry logic."""
    max_retries = 10
    for attempt in range(1, max_retries + 1):
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
            db = client.get_default_database()
            logger.info(f"✅ Connected to MongoDB database: {db.name}")
            return db
        except Exception as e:
            logger.warning(f"MongoDB connection attempt {attempt}/{max_retries} failed: {e}")
            time.sleep(min(2 ** attempt, 30))
    logger.error("❌ Could not connect to MongoDB after retries")
    sys.exit(1)


# --------------- Task Operations ---------------
def process_uppercase(text):
    return text.upper()


def process_lowercase(text):
    return text.lower()


def process_reverse(text):
    return text[::-1]


def process_wordcount(text):
    words = text.split()
    return str(len(words))


OPERATIONS = {
    "uppercase": process_uppercase,
    "lowercase": process_lowercase,
    "reverse": process_reverse,
    "wordcount": process_wordcount,
}


# --------------- Job Processor ---------------
def process_task(db, task_id):
    """
    Process a single task:
    1. Fetch task from MongoDB
    2. Update status to 'running'
    3. Execute the operation
    4. Save result and logs
    5. Update status to 'success' or 'failed'
    """
    tasks_collection = db["tasks"]
    logs = []
    start_time = time.time()

    try:
        # Fetch task
        task = tasks_collection.find_one({"_id": ObjectId(task_id)})
        if not task:
            logger.error(f"Task {task_id} not found in database")
            return

        logs.append(f"[{datetime.now(timezone.utc).isoformat()}] Task fetched: {task['title']}")
        logger.info(f"📋 Processing task {task_id}: {task['title']} (op={task['operation']})")

        # Update status to running
        tasks_collection.update_one(
            {"_id": ObjectId(task_id)},
            {"$set": {"status": "running"}, "$push": {"logs": f"[{datetime.now(timezone.utc).isoformat()}] Status changed to running"}},
        )
        logs.append(f"[{datetime.now(timezone.utc).isoformat()}] Status changed to running")

        # Get operation function
        operation = task.get("operation")
        if operation not in OPERATIONS:
            raise ValueError(f"Unknown operation: {operation}")

        op_func = OPERATIONS[operation]
        input_text = task.get("inputText", "")
        logs.append(f"[{datetime.now(timezone.utc).isoformat()}] Executing operation: {operation}")
        logger.info(f"⚙️  Executing '{operation}' on {len(input_text)} chars")

        # Execute operation
        result = op_func(input_text)
        elapsed = round(time.time() - start_time, 3)
        logs.append(f"[{datetime.now(timezone.utc).isoformat()}] Operation completed in {elapsed}s")
        logs.append(f"[{datetime.now(timezone.utc).isoformat()}] Result length: {len(result)} chars")

        # Update task with success
        tasks_collection.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {
                    "status": "success",
                    "result": result,
                    "logs": logs,
                }
            },
        )
        logger.info(f"✅ Task {task_id} completed successfully in {elapsed}s")

    except Exception as e:
        error_msg = str(e)
        logs.append(f"[{datetime.now(timezone.utc).isoformat()}] ERROR: {error_msg}")
        logger.error(f"❌ Task {task_id} failed: {error_msg}")

        # Update task with failure
        try:
            tasks_collection.update_one(
                {"_id": ObjectId(task_id)},
                {
                    "$set": {
                        "status": "failed",
                        "result": f"Error: {error_msg}",
                        "logs": logs,
                    }
                },
            )
        except Exception as update_err:
            logger.error(f"Failed to update task status: {update_err}")


# --------------- Main Loop ---------------
def main():
    logger.info("🚀 AI Task Worker starting...")
    logger.info(f"   Redis: {REDIS_URL}")
    logger.info(f"   Mongo: {MONGO_URI}")
    logger.info(f"   Queue: {QUEUE_NAME}")

    redis_client = connect_redis()
    db = connect_mongo()

    logger.info("👂 Listening for jobs...")

    while True:
        try:
            # BLPOP blocks until a job is available (or timeout)
            result = redis_client.blpop(QUEUE_NAME, timeout=POLL_TIMEOUT)

            if result is None:
                continue  # timeout, loop again

            _, job_data = result
            logger.info(f"📥 Received job: {job_data}")

            try:
                job = json.loads(job_data)
                task_id = job.get("taskId")
                if not task_id:
                    logger.error(f"Job missing taskId: {job_data}")
                    continue
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON in job: {job_data}")
                continue

            process_task(db, task_id)

        except redis.ConnectionError as e:
            logger.error(f"Redis connection lost: {e}. Reconnecting...")
            time.sleep(5)
            redis_client = connect_redis()

        except KeyboardInterrupt:
            logger.info("🛑 Worker shutting down...")
            break

        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            time.sleep(2)


if __name__ == "__main__":
    main()
