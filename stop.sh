#!/bin/bash

# MIT Alandi Hackathon - Stop Script
# This script stops all running servers

PROJECT_ROOT="/home/wraient/Projects/MIT Alandi Hackathon"

# Call the main start script with stop argument
exec "$PROJECT_ROOT/start.sh" stop
