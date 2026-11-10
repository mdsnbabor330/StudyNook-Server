import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const dbUrl = process.env.DB_URL;

app.use(cors());
app.use(express.json());

const client = new MongoClient(dbUrl);

export async function connectToMongoDB() {
  try {
    await client.connect();

    const db = client.db("StudyNook");
    let roomsCollection = db.collection("Rooms");
    const bookingsCollection = db.collection("Bookings");

    app.post("/rooms/my-listings", async (req, res) => {
      try {
        const room = req.body;
        const result = await roomsCollection.insertOne(room);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to add room", error: error.message });
      }
    });

    app.get("/explore-rooms", async (req, res) => {
      try {
        const rooms = await roomsCollection
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();

        res.status(200).send(rooms);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch explore rooms",
          error: error.message,
        });
      }
    });

    app.get("/rooms", async (req, res) => {
      try {
        const { search, floor, amenity, maxRate, minCapacity, sort } =
          req.query;
        let query = {};

        if (search) {
          query.roomName = { $regex: search, $options: "i" };
        }

        if (floor && floor !== "all") {
          query.floor = floor;
        }

        if (amenity && amenity !== "all") {
          query.amenities = { $in: [amenity] };
        }

        if (minCapacity) {
          query.capacity = { $gte: Number(minCapacity) };
        }

        if (maxRate) {
          query.hourlyRate = { $lte: Number(maxRate) };
        }

        let sortOption = { _id: -1 };
        if (sort === "price-low") {
          sortOption = { hourlyRate: 1 };
        } else if (sort === "price-high") {
          sortOption = { hourlyRate: -1 };
        } else if (sort === "capacity") {
          sortOption = { capacity: -1 };
        }

        const rooms = await roomsCollection
          .find(query)
          .sort(sortOption)
          .toArray();
        res.send(rooms);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch rooms", error: error.message });
      }
    });

    app.get("/rooms/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const room = await roomsCollection.findOne({ _id: new ObjectId(id) });
        console.log("room", room);
        res.send(room);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch room", error: error.message });
      }
    });

    app.put("/rooms/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = { ...req.body };
        delete updatedData._id;

        if (updatedData.capacity) {
          updatedData.capacity = Number(updatedData.capacity);
        }
        if (updatedData.hourlyRate) {
          updatedData.hourlyRate = Number(updatedData.hourlyRate);
        }

        const result = await roomsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData },
        );
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to update room", error: error.message });
      }
    });

    app.delete("/rooms/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await roomsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        await bookingsCollection.deleteMany({ roomId: id });
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to delete room", error: error.message });
      }
    });

    app.post("/my-bookings", async (req, res) => {
      try {
        const booking = req.body;
        const { roomId, date, startTime, endTime } = booking;

        const existingBookings = await bookingsCollection
          .find({ roomId, date, status: { $ne: "Cancelled" } })
          .toArray();

        const toMinutes = (time) => {
          const [hours, minutes] = time.split(":").map(Number);
          return hours * 60 + minutes;
        };

        const conflict = existingBookings.some((item) => {
          return (
            toMinutes(startTime) < toMinutes(item.endTime) &&
            toMinutes(endTime) > toMinutes(item.startTime)
          );
        });

        if (conflict) {
          return res.status(409).send({
            message: "This room is already booked for this time.",
          });
        }

        const result = await bookingsCollection.insertOne({
          ...booking,
          status: "Confirmed",
          createdAt: new Date(),
        });

        await roomsCollection.updateOne(
          { _id: new ObjectId(roomId) },
          { $inc: { bookingCount: 1 } },
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to create booking",
          error: error.message,
        });
      }
    });

    app.get("/my-bookings", async (req, res) => {
      try {
        const { userId } = req.query;
        const query = userId ? { userId } : {};
        const bookingsroom = await bookingsCollection.find(query).toArray();
        res.send(bookingsroom);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch bookings", error: error.message });
      }
    });

    app.patch("/my-bookings/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res.status(404).send({ message: "Booking not found" });
        }

        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "Cancelled" } },
        );

        if (booking.roomId) {
          try {
            await roomsCollection.updateOne(
              { _id: new ObjectId(booking.roomId) },
              { $inc: { bookingCount: -1 } },
            );
          } catch (e) {
            console.warn("Could not decrement room booking count:", e.message);
          }
        }

        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to cancel booking", error: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });

    console.log("Successfully connected to MongoDB!");

    return client;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

connectToMongoDB();

// Call this only when your application terminates
export async function disconnectFromMongoDB() {
  await client.close();
}

// Home Route
app.get("/", (req, res) => {
  res.send("Hello, World!");
});
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
