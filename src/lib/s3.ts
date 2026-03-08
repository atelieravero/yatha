import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Initializes the S3 Client using Cloudflare R2 credentials.
 * R2 is 100% compatible with the AWS S3 API.
 */
export const r2Client = new S3Client({
  region: "auto", // Cloudflare R2 always uses 'auto' for the region
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

/**
 * Generates a "Presigned URL". 
 * * WHY THIS IS BRILLIANT:
 * Instead of a user uploading a 2GB video file to our Next.js server (which would crash it),
 * our server uses its secret keys to generate a temporary, secure "upload ticket" (URL).
 * The user's browser then uploads the file *directly* to Cloudflare using this ticket.
 */
export async function generateUploadUrl(filename: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: filename,
    ContentType: contentType,
  });

  // This URL is valid for exactly 1 hour.
  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  
  return {
    uploadUrl: signedUrl,
    // We return the generated URL to the file so we can save it in our Postgres database
    fileUrl: `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET_NAME}/${filename}`
  };
}

export async function generateReadUrl(filename: string) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME!,
    Key: filename,
  });
  // Generate a read link valid for 1 hour
  return await getSignedUrl(r2Client, command, { expiresIn: 3600 });
}