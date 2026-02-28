# Bitespeed Identity Reconciliation

## Overview
This project implements an identity reconciliation system that links customer contacts based on shared email or phone number.

The system ensures:
- Oldest contact remains primary
- New contacts are linked as secondary
- Multiple primary contacts are merged correctly
- Data consistency using PostgreSQL transactions

---

## Tech Stack
- Node.js
- Express
- PostgreSQL
- pg (node-postgres)

---

## API Endpoint

### POST /identify

### Request Body (JSON)
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}

At least one field is required.

---

### Response Format

{
  "contact": {
    "primaryContactId": number,
    "emails": string[],
    "phoneNumbers": string[],
    "secondaryContactIds": number[]
  }
}

---

## Features Implemented

- Create new primary contact
- Create secondary contact if new info provided
- Merge multiple primary groups
- Preserve oldest primary
- Transaction-safe database operations
- Input validation
- Indexed database for performance

---

## Running Locally

1. Install dependencies:
   npm install

2. Set up PostgreSQL database

3. Add environment variables in `.env`

4. Start server:
   node server.js

Server runs on:
http://localhost:3000

---

## Health Check
GET /health

---

## Author
Raj Singh