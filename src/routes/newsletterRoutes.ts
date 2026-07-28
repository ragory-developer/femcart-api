import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

router.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Check if exists
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email }
    });

    if (existing) {
      if (existing.status === "UNSUBSCRIBED") {
        // Resubscribe
        await prisma.newsletterSubscriber.update({
          where: { email },
          data: { status: "SUBSCRIBED" }
        });
        return res.json({ success: true, message: "Successfully resubscribed to the newsletter!" });
      }
      return res.status(400).json({ error: "This email is already subscribed" });
    }

    // Create new
    await prisma.newsletterSubscriber.create({
      data: { email }
    });

    res.json({ success: true, message: "Successfully subscribed to the newsletter!" });
  } catch (error) {
    console.error("Newsletter subscription error:", error);
    res.status(500).json({ error: "Failed to subscribe to the newsletter" });
  }
});

export default router;
