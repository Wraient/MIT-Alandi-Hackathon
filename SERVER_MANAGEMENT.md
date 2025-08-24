# MIT Alandi Hackathon - Server Management

This project includes easy-to-use scripts to manage all servers (GraphHopper, Backend API, and Frontend).

## Quick Start

```bash
# Start all servers
./start.sh

# Stop all servers (or press Ctrl+C when running)
./stop.sh

# Check server status
./start.sh status

# View logs
./start.sh logs backend
./start.sh logs frontend
./start.sh logs graphhopper
```

## Scripts

### `start.sh` - Main Server Manager
- **`./start.sh`** or **`./start.sh start`** - Start all servers in background
- **`./start.sh stop`** - Stop all servers
- **`./start.sh restart`** - Restart all servers  
- **`./start.sh status`** - Show server status
- **`./start.sh logs [service]`** - View logs

### `stop.sh` - Quick Stop
- **`./stop.sh`** - Stop all servers immediately

## What the Scripts Do

### Starting Servers
1. **GraphHopper** (Port 9000) - Routing engine with OSM data
2. **Backend API** (Port 3001) - Node.js/Express API server
3. **Frontend** (Port 3000) - React logistics dashboard

### Features
- ✅ **Background execution** - All servers run in background
- ✅ **Process monitoring** - Detects if servers crash
- ✅ **Graceful shutdown** - Ctrl+C stops everything cleanly
- ✅ **Health checks** - Waits for servers to be ready
- ✅ **Log management** - Separate log files for each service
- ✅ **PID tracking** - Tracks running processes
- ✅ **Port cleanup** - Kills stale processes on required ports

### Access Points
- **Admin Dashboard**: http://localhost:3000
- **Mobile Driver View**: http://localhost:3000/driver  
- **Backend API**: http://localhost:3001
- **GraphHopper**: http://localhost:9000

## Troubleshooting

### Check Server Status
```bash
./start.sh status
```

### View Logs
```bash
# Backend logs
./start.sh logs backend

# Frontend logs  
./start.sh logs frontend

# GraphHopper logs
./start.sh logs graphhopper

# Or directly
tail -f logs/backend.log
tail -f logs/frontend.log
tail -f logs/graphhopper.log
```

### Clean Restart
```bash
./stop.sh
sleep 3
./start.sh
```

### Manual Port Cleanup
```bash
# If ports are still occupied
sudo lsof -ti:3000,3001,9000 | xargs kill -9
```

## File Structure
```
/home/wraient/Projects/MIT Alandi Hackathon/
├── start.sh           # Main server management script
├── stop.sh            # Quick stop script  
├── logs/              # Log files
│   ├── backend.log    # Backend API logs
│   ├── frontend.log   # Frontend logs
│   └── graphhopper.log # GraphHopper logs
├── .pids/             # Process ID files
│   ├── backend.pid
│   ├── frontend.pid
│   └── graphhopper.pid
├── backend/           # Backend API source
├── web-ui/logistics-dashboard/ # Frontend source
└── graphhopper/       # GraphHopper server
```

## Notes

- The script automatically installs npm dependencies if needed
- All processes run in background with proper PID tracking
- Logs are rotated and stored in the `logs/` directory
- Use Ctrl+C to gracefully stop all servers when running `./start.sh`
- The script handles unexpected process crashes and cleans up automatically
