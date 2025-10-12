#!/bin/bash

# Run database migration for saved AI images

echo "Running migration: 003_saved_ai_images.sql"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  echo "Please set it in your .env file or export it"
  exit 1
fi

# Run the migration using psql
psql "$DATABASE_URL" < migrations/003_saved_ai_images.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration completed successfully!"
else
  echo "❌ Migration failed!"
  exit 1
fi
