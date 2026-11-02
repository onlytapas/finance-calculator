#!/bin/bash
# Double-click this file in Finder to start the dashboard and open it in the browser.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:4545") &
node server.js
