const { MongoClient, ServerApiVersion}= require("mongodb");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT ;
const dbUrl = process.env.DB_URL;

app.use(cors());
app.use(express.json());

const client = new MongoClient(dbUrl, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("StudyNook");
    const roomsCollection = db.collection("Rooms");

    app.get("/explore-rooms", async (req, res) => {
      try {
        const rooms = await roomsCollection
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();
        res.send(rooms);
      } catch (error) {
        res
          .status(500)
          .send({
            message: "Failed to fetch explore rooms",
            error: error.message,
          });
      }
    });

    
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
