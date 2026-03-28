import { S3Client } from "@aws-sdk/client-s3";

const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_ENDPOINT,
  AWS_S3_FORCE_PATH_STYLE,
} = process.env;

const s3Config = {
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
};

if (AWS_S3_ENDPOINT) {
  s3Config.endpoint = AWS_S3_ENDPOINT;
}

if (AWS_S3_FORCE_PATH_STYLE) {
  s3Config.forcePathStyle = AWS_S3_FORCE_PATH_STYLE === "true";
}

const s3Client = new S3Client(s3Config);

export default s3Client;