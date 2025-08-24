# Problem Statement
12. Agentic AI for Real-Time Decision Support Description: Create an AI agent that makes quick operational decisions from streaming data. 
Example: An AI logistics dispatcher that reroutes delivery vehicles based on live traffic or weather updates. 
Key challenges: streaming inference, latency, handling incomplete information

# Goal
Create a logistic system to route delivery drivers, one delivery driver would have multiple packages to be delivered at many places, and pickups.

## Mobile UI
1. Delivery drivers would have an app which would show them the route they have to take, they enter their Driver ID and a route is shown which is fastest way to deliver all the deliveries
2. New updates to delivery can be added for pickup if the driver is closeby, update the route for pickup else, wait for a new delivery
Devliery route can also be updated due to traffic or weather conditions
3. After an order is delivered it automatically starts route to next order with same details

## Web UI
3. Web UI is for Admin to show dashboard of all the deliveries being delivered with all the drivers and vehicles.
4. You can add traffic, strom at any point in map to simulate weather and traffic to see how system reacts to it for demo purposes
5. You can add drivers to simulate new drivers, it should all be done using a sqlite database, system fetches deliveries and routes alloted and updates stuff accordingly

# Tech Stack

## Frontend
React + MapBox GL JS (Or leaflet.js) reason on which one would be best for looking and developmenet
UI Framework: Tailwind CSS

## Backend
FastAPI or Nodejs
SQLite DB
Routing Engine: OSRM / GraphHopper

## Mobile UI
React
Enter Driver ID
Show Map, Route, ETA
Notify when route change with reason
Show overall deliveries

## Web UI
[] - Map Display
[] - Shortest Path API
[] - Simulate Strom Button
[] - Simulate Traffic Button
[] - Metrics Panel - Time saved, Decision Latency, Number of deliveries rerouted, 
[] - Vehical Add Button
[] - Vehical ID
[] - Vehical Driver ID
[] - Insert Delivery Points
[] - AI Questions

## Mobile UI
[] - Enter Driver ID
[] - Render Map
[] - Show Route
[] - Notification for driver reroute reason
[] - Live Update Delivery Points
[] - Live Update Route
