require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test route
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "Database connected successfully",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.post("/identify", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const email = req.body.email || null;
    const phoneNumber = req.body.phoneNumber
      ? String(req.body.phoneNumber)
      : null;

    if (!email && !phoneNumber) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "At least one of email or phoneNumber is required",
      });
    }

    if (email && typeof email !== "string") {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (phoneNumber && isNaN(phoneNumber)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    // Find direct matches
    const directMatches = await client.query(
      `
      SELECT * FROM Contact
      WHERE email = $1 OR phonenumber = $2
      `,
      [email, phoneNumber],
    );

    // No match → create primary
    if (directMatches.rows.length === 0) {
      const insert = await client.query(
        `
        INSERT INTO Contact (email, phonenumber, linkprecedence)
        VALUES ($1, $2, 'primary')
        RETURNING *
        `,
        [email, phoneNumber],
      );

      await client.query("COMMIT");

      const newContact = insert.rows[0];

      return res.status(200).json({
        contact: {
          primaryContactId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phonenumber ? [newContact.phonenumber] : [],
          secondaryContactIds: [],
        },
      });
    }

    // Collect root primary IDs
    let rootIds = [];

    for (let c of directMatches.rows) {
      if (c.linkprecedence === "primary") {
        rootIds.push(c.id);
      } else {
        rootIds.push(c.linkedid);
      }
    }

    rootIds = [...new Set(rootIds)];

    // Fetch full groups
    const allRelated = await client.query(
      `
      SELECT * FROM Contact
      WHERE id = ANY($1) OR linkedid = ANY($1)
      `,
      [rootIds],
    );

    let allContacts = allRelated.rows;

    // Determine oldest primary
    const primaries = allContacts.filter((c) => c.linkprecedence === "primary");

    primaries.sort((a, b) => new Date(a.createdat) - new Date(b.createdat));

    const oldestPrimary = primaries[0];

    // Convert other primaries
    for (let p of primaries) {
      if (p.id !== oldestPrimary.id) {
        await client.query(
          `
          UPDATE Contact
          SET linkprecedence = 'secondary',
              linkedid = $1,
              updatedat = CURRENT_TIMESTAMP
          WHERE id = $2
          `,
          [oldestPrimary.id, p.id],
        );
      }
    }

    // Refresh after merge
    const refreshed = await client.query(
      `
      SELECT * FROM Contact
      WHERE id = $1 OR linkedid = $1
      `,
      [oldestPrimary.id],
    );

    allContacts = refreshed.rows;

    // Insert secondary if new info
    const emailExists = allContacts.some((c) => c.email === email);

    const phoneExists = allContacts.some((c) => c.phonenumber === phoneNumber);

    if (!emailExists || !phoneExists) {
      await client.query(
        `
        INSERT INTO Contact (email, phonenumber, linkedid, linkprecedence)
        VALUES ($1, $2, $3, 'secondary')
        `,
        [email, phoneNumber, oldestPrimary.id],
      );

      const finalFetch = await client.query(
        `
        SELECT * FROM Contact
        WHERE id = $1 OR linkedid = $1
        `,
        [oldestPrimary.id],
      );

      allContacts = finalFetch.rows;
    }

    await client.query("COMMIT");

    return res.status(200).json({
      contact: {
        primaryContactId: oldestPrimary.id,
        emails: [...new Set(allContacts.map((c) => c.email).filter(Boolean))],
        phoneNumbers: [
          ...new Set(allContacts.map((c) => c.phonenumber).filter(Boolean)),
        ],
        secondaryContactIds: allContacts
          .filter((c) => c.linkprecedence === "secondary")
          .map((c) => c.id),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
