import express from "express";
import multer from "multer";
import {
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "../config/s3.js";

const router = express.Router();

const ALLOWED_M4A_MIME_TYPES = ["audio/mp4", "audio/x-m4a"];

const isM4aFile = (file = {}) => {
  const name = (file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  return name.endsWith(".m4a") || ALLOWED_M4A_MIME_TYPES.includes(mime);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isM4aFile(file)) {
      return cb(new Error("Only .m4a audio files are allowed"));
    }
    return cb(null, true);
  },
});

const bucket = process.env.AWS_S3_BUCKET;

if (!bucket) {
  // Keep startup simple; API will return a clear error if bucket is missing.
  console.warn("AWS_S3_BUCKET is not configured");
}

const sanitizeFileName = (name = "audio.m4a") =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_");

const makeObjectKey = (userId, originalName) => {
  const safeUserId = (userId || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanName = sanitizeFileName(originalName || "audio.m4a");
  const withM4aExtension = cleanName.toLowerCase().endsWith(".m4a")
    ? cleanName
    : `${cleanName}.m4a`;
  return `recordings/${safeUserId}/${Date.now()}-${withM4aExtension}`;
};

router.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!bucket) {
      return res.status(500).json({ message: "AWS_S3_BUCKET is not configured" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No audio file provided. Use field name 'audio'." });
    }

    if (!isM4aFile(req.file)) {
      return res.status(400).json({ message: "Only .m4a audio files are allowed" });
    }

    const userId = req.body.userId || req.query.userId;
    const key = makeObjectKey(userId, req.file.originalname);

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: "audio/mp4",
    });

    await s3Client.send(putCommand);

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 60 * 60 }
    );

    return res.status(201).json({
      message: "Audio uploaded successfully",
      userId: userId || "anonymous",
      key,
      url: signedUrl,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to upload .m4a audio",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    if (!bucket) {
      return res.status(500).json({ message: "AWS_S3_BUCKET is not configured" });
    }

    const userId = req.query.userId || "anonymous";
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const prefix = `recordings/${safeUserId}/`;

    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const result = await s3Client.send(listCommand);
    const objects = result.Contents || [];

    const recordings = await Promise.all(
      objects.map(async (item) => {
        const key = item.Key;
        if (!key) return null;

        const url = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: 60 * 60 }
        );

        return {
          key,
          size: item.Size,
          lastModified: item.LastModified,
          url,
        };
      })
    );

    return res.json({
      userId,
      count: recordings.filter(Boolean).length,
      recordings: recordings.filter(Boolean),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch recordings",
      error: error.message,
    });
  }
});

export default router;