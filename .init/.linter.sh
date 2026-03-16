#!/bin/bash
cd /tmp/kavia/workspace/code-generation/simple-web-starter-240791-240805/frontend_react_app
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

