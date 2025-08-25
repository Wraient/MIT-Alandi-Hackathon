#!/bin/bash

# MIT Alandi Hackathon - Server Management Script
# This script starts GraphHopper, Backend API, and Frontend servers

set -e

PROJECT_ROOT="/home/wraient/Projects/MIT Alandi Hackathon"
GRAPHHOPPER_DIR="$PROJECT_ROOT/graphhopper"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/web-ui/logistics-dashboard"

# PID files to track running processes
PIDS_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PIDS_DIR"

GRAPHHOPPER_PID="$PIDS_DIR/graphhopper.pid"
BACKEND_PID="$PIDS_DIR/backend.pid"
FRONTEND_PID="$PIDS_DIR/frontend.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} ✅ $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} ⚠️  $1"
}

print_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ❌ $1"
}

# Function to check if a process is running
is_running() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Function to stop a process
stop_process() {
    local pid_file="$1"
    local name="$2"
    
    if is_running "$pid_file"; then
        local pid=$(cat "$pid_file")
        print_status "Stopping $name (PID: $pid)..."
        kill -TERM "$pid" 2>/dev/null || true
        
        # Wait up to 10 seconds for graceful shutdown
        for i in {1..10}; do
            if ! ps -p "$pid" > /dev/null 2>&1; then
                break
            fi
            sleep 1
        done
        
        # Force kill if still running
        if ps -p "$pid" > /dev/null 2>&1; then
            print_warning "Force killing $name..."
            kill -KILL "$pid" 2>/dev/null || true
        fi
        
        rm -f "$pid_file"
        print_success "$name stopped"
    else
        print_status "$name is not running"
    fi
}

# Function to stop all servers
stop_all() {
    print_status "🛑 Stopping all servers..."
    
    stop_process "$FRONTEND_PID" "Frontend"
    stop_process "$BACKEND_PID" "Backend API"
    stop_process "$GRAPHHOPPER_PID" "GraphHopper"
    
    # Also kill any remaining processes on our ports
    print_status "Cleaning up any remaining processes on ports 3000, 3001, 9000..."
    
    # Kill processes on port 3000 (Frontend)
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    
    # Kill processes on port 3001 (Backend)
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    
    # Kill processes on port 9000 (GraphHopper)
    lsof -ti:9000 | xargs kill -9 2>/dev/null || true
    
    print_success "All servers stopped"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "🔍 Checking prerequisites..."
    
    # Check if Java is installed
    if ! command -v java &> /dev/null; then
        print_error "Java is not installed. Please install Java 11 or higher."
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js."
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm."
        exit 1
    fi
    
    # Check if required files exist
    if [ ! -f "$GRAPHHOPPER_DIR/graphhopper-web-6.2.jar" ]; then
        print_error "GraphHopper JAR file not found at $GRAPHHOPPER_DIR/graphhopper-web-6.2.jar"
        exit 1
    fi
    
    if [ ! -f "$GRAPHHOPPER_DIR/config.yml" ]; then
        print_error "GraphHopper config file not found at $GRAPHHOPPER_DIR/config.yml"
        exit 1
    fi
    
    if [ ! -f "$BACKEND_DIR/package.json" ]; then
        print_error "Backend package.json not found at $BACKEND_DIR/package.json"
        exit 1
    fi
    
    if [ ! -f "$FRONTEND_DIR/package.json" ]; then
        print_error "Frontend package.json not found at $FRONTEND_DIR/package.json"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to start GraphHopper
start_graphhopper() {
    print_status "🗺️  Starting GraphHopper server..."
    
    if is_running "$GRAPHHOPPER_PID"; then
        print_warning "GraphHopper is already running"
        return
    fi
    
    cd "$GRAPHHOPPER_DIR"
    
    # Start GraphHopper in background with nohup and proper backgrounding
    nohup java -jar graphhopper-web-6.2.jar server config.yml \
               > ../logs/graphhopper.log 2>&1 &
    
    local pid=$!
    echo "$pid" > "$GRAPHHOPPER_PID"
    
    print_status "GraphHopper started with PID $pid, waiting for it to be ready..."
    
    # Wait for GraphHopper to be ready (check API endpoint)
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f "http://localhost:9000/info" > /dev/null 2>&1; then
            print_success "GraphHopper server is ready on port 9000"
            return
        fi
        
        sleep 2
        attempt=$((attempt + 1))
        print_status "Waiting for GraphHopper to be ready... ($attempt/$max_attempts)"
    done
    
    print_error "GraphHopper failed to start within 60 seconds"
    stop_process "$GRAPHHOPPER_PID" "GraphHopper"
    exit 1
}

# Function to start Backend API
start_backend() {
    print_status "🚀 Starting Backend API server..."
    
    if is_running "$BACKEND_PID"; then
        print_warning "Backend API is already running"
        return
    fi
    
    cd "$BACKEND_DIR"
    
    # Build TypeScript every time
    print_status "Building backend..."
    npm run build
    
    # Start backend in background with nohup and proper backgrounding
    nohup npm run start > ../logs/backend.log 2>&1 &
    
    local pid=$!
    echo "$pid" > "$BACKEND_PID"
    
    print_status "Backend API started with PID $pid, waiting for it to be ready..."
    
    # Wait for backend to be ready (check API endpoint)
    local max_attempts=15
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f "http://localhost:3001/api/drivers" > /dev/null 2>&1; then
            print_success "Backend API server is ready on port 3001"
            return
        fi
        
        sleep 2
        attempt=$((attempt + 1))
        print_status "Waiting for Backend API to be ready... ($attempt/$max_attempts)"
    done
    
    print_error "Backend API failed to start within 30 seconds"
    stop_process "$BACKEND_PID" "Backend API"
    exit 1
}

# Function to start Frontend
start_frontend() {
    print_status "💻 Starting Frontend server..."
    
    if is_running "$FRONTEND_PID"; then
        print_warning "Frontend is already running"
        return
    fi
    
    cd "$FRONTEND_DIR"

    # Build the frontend (optional - for production builds)
    # Uncomment the next line if you want to build before serving
    # print_status "Building frontend..."
    # npm run build
    
    # Start frontend in background with nohup and proper backgrounding
    BROWSER=none nohup npm start > ../../logs/frontend.log 2>&1 &
    
    local pid=$!
    echo "$pid" > "$FRONTEND_PID"
    
    print_status "Frontend started with PID $pid, waiting for it to be ready..."
    
    # Wait for frontend to be ready (check port with curl)
    local max_attempts=20
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -f "http://localhost:3000" > /dev/null 2>&1; then
            print_success "Frontend server is ready on port 3000"
            return
        fi
        
        sleep 3
        attempt=$((attempt + 1))
        print_status "Waiting for Frontend to be ready... ($attempt/$max_attempts)"
    done
    
    print_error "Frontend failed to start within 60 seconds"
    stop_process "$FRONTEND_PID" "Frontend"
    exit 1
}

# Function to show server status
show_status() {
    print_status "📊 Server Status:"
    echo
    
    if is_running "$GRAPHHOPPER_PID"; then
        local pid=$(cat "$GRAPHHOPPER_PID")
        print_success "GraphHopper: Running (PID: $pid) - http://localhost:9000"
    else
        print_error "GraphHopper: Not running"
    fi
    
    if is_running "$BACKEND_PID"; then
        local pid=$(cat "$BACKEND_PID")
        print_success "Backend API: Running (PID: $pid) - http://localhost:3001"
    else
        print_error "Backend API: Not running"
    fi
    
    if is_running "$FRONTEND_PID"; then
        local pid=$(cat "$FRONTEND_PID")
        print_success "Frontend: Running (PID: $pid) - http://localhost:3000"
    else
        print_error "Frontend: Not running"
    fi
    
    echo
}

# Function to show logs
show_logs() {
    local service="$1"
    case "$service" in
        "graphhopper"|"gh")
            if [ -f "$PROJECT_ROOT/logs/graphhopper.log" ]; then
                tail -f "$PROJECT_ROOT/logs/graphhopper.log"
            else
                print_error "GraphHopper log file not found"
            fi
            ;;
        "backend"|"be")
            if [ -f "$PROJECT_ROOT/logs/backend.log" ]; then
                tail -f "$PROJECT_ROOT/logs/backend.log"
            else
                print_error "Backend log file not found"
            fi
            ;;
        "frontend"|"fe")
            if [ -f "$PROJECT_ROOT/logs/frontend.log" ]; then
                tail -f "$PROJECT_ROOT/logs/frontend.log"
            else
                print_error "Frontend log file not found"
            fi
            ;;
        *)
            echo "Available log files:"
            if [ -f "$PROJECT_ROOT/logs/graphhopper.log" ]; then
                echo "  - GraphHopper: tail -f '$PROJECT_ROOT/logs/graphhopper.log'"
            fi
            if [ -f "$PROJECT_ROOT/logs/backend.log" ]; then
                echo "  - Backend: tail -f '$PROJECT_ROOT/logs/backend.log'"
            fi
            if [ -f "$PROJECT_ROOT/logs/frontend.log" ]; then
                echo "  - Frontend: tail -f '$PROJECT_ROOT/logs/frontend.log'"
            fi
            ;;
    esac
}

# Signal handlers for Ctrl+C
cleanup() {
    echo
    print_status "🛑 Received interrupt signal. Stopping all servers..."
    stop_all
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

# Main script logic
case "${1:-start}" in
    "start")
        print_status "🚀 Starting MIT Alandi Hackathon servers..."
        echo
        
        check_prerequisites
        start_graphhopper
        start_backend
        start_frontend
        
        echo
        show_status
        echo
        print_success "🎉 All servers started successfully!"
        echo
        print_status "📝 Access points:"
        echo "   • Admin Dashboard: http://localhost:3000"
        echo "   • Mobile Driver View: http://localhost:3000/driver"
        echo "   • Backend API: http://localhost:3001"
        echo "   • GraphHopper: http://localhost:9000"
        echo
        print_status "💡 Commands:"
        echo "   • Check status: ./start.sh status"
        echo "   • Stop servers: ./start.sh stop"
        echo "   • View logs: ./start.sh logs [graphhopper|backend|frontend]"
        echo "   • Ctrl+C: Stop all servers"
        echo
        
        # Keep script running to handle Ctrl+C
        print_status "🔄 Servers running in background. Press Ctrl+C to stop all servers."
        
        # Monitor processes and wait
        while true; do
            sleep 5
            
            # Check if any process died unexpectedly
            if ! is_running "$GRAPHHOPPER_PID"; then
                print_error "GraphHopper stopped unexpectedly!"
                stop_all
                exit 1
            fi
            
            if ! is_running "$BACKEND_PID"; then
                print_error "Backend API stopped unexpectedly!"
                stop_all
                exit 1
            fi
            
            if ! is_running "$FRONTEND_PID"; then
                print_error "Frontend stopped unexpectedly!"
                stop_all
                exit 1
            fi
        done
        ;;
        
    "stop")
        stop_all
        ;;
        
    "restart")
        stop_all
        sleep 3
        exec "$0" start
        ;;
        
    "status")
        show_status
        ;;
        
    "logs")
        show_logs "$2"
        ;;
        
    *)
        echo "MIT Alandi Hackathon - Server Management"
        echo
        echo "Usage: $0 [start|stop|restart|status|logs]"
        echo
        echo "Commands:"
        echo "  start    - Start all servers (default)"
        echo "  stop     - Stop all servers"
        echo "  restart  - Restart all servers"
        echo "  status   - Show server status"
        echo "  logs     - Show logs [graphhopper|backend|frontend]"
        echo
        echo "Examples:"
        echo "  $0                    # Start all servers"
        echo "  $0 start              # Start all servers"
        echo "  $0 stop               # Stop all servers"
        echo "  $0 status             # Check status"
        echo "  $0 logs backend       # View backend logs"
        echo
        exit 1
        ;;
esac
