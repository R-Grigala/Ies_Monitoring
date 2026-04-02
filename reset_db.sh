#!/bin/bash

echo "Create Database"
flask init_db
echo "==================================="

echo "Create Test Tables"
flask populate_db
echo "==================================="