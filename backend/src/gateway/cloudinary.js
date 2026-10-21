import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import cloudinary from 'cloudinary';

export function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export function configureCloudinary() {
  if (!cloudinaryConfigured()) return null;
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary.v2;
}

export async function uploadPublicBuffer(file, folder = 'uploads', resourceType = 'image') {
  if (cloudinaryConfigured()) {
    const cl = configureCloudinary();
    return new Promise((resolve, reject) => {
      const stream = cl.uploader.upload_stream({
        folder,
        resource_type: resourceType,
        type: 'upload',
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        timeout: 120000,
      }, (error, result) => error ? reject(error) : resolve(result));
      stream.end(file.buffer);
    });
  }

  // Graceful local file storage fallback
  const cleanFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uploadsDir = path.join(process.cwd(), 'uploads', cleanFolder);
  await fs.mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(file.originalname) || (resourceType === 'image' ? '.png' : '.pdf');
  const filename = `${randomUUID()}${ext}`;
  const targetPath = path.join(uploadsDir, filename);
  await fs.writeFile(targetPath, file.buffer);

  const localId = `local:${cleanFolder}/${filename}`;
  return {
    public_id: localId,
    secure_url: `/api/v1/uploads/${cleanFolder}/${filename}`,
    original_filename: file.originalname,
    bytes: file.size,
    format: ext.replace(/^\./, ''),
  };
}

export async function uploadAuthenticatedBuffer(file, folder = 'uploads', resourceType = 'image') {
  if (cloudinaryConfigured()) {
    const cl = configureCloudinary();
    return new Promise((resolve, reject) => {
      const stream = cl.uploader.upload_stream({
        folder,
        resource_type: resourceType,
        type: 'authenticated',
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        timeout: 120000,
      }, (error, result) => error ? reject(error) : resolve(result));
      stream.end(file.buffer);
    });
  }

  // Graceful local file storage fallback
  const cleanFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uploadsDir = path.join(process.cwd(), 'uploads', cleanFolder);
  await fs.mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(file.originalname) || (resourceType === 'image' ? '.png' : '.pdf');
  const filename = `${randomUUID()}${ext}`;
  const targetPath = path.join(uploadsDir, filename);
  await fs.writeFile(targetPath, file.buffer);

  const localId = `local:${cleanFolder}/${filename}`;
  return {
    public_id: localId,
    secure_url: `/api/v1/uploads/${cleanFolder}/${filename}`,
    original_filename: file.originalname,
    bytes: file.size,
    format: ext.replace(/^\./, ''),
  };
}

export async function deleteAuthenticatedAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  if (publicId.startsWith('local:')) {
    const rel = publicId.replace(/^local:/, '');
    const localPath = path.join(process.cwd(), 'uploads', rel);
    await fs.unlink(localPath).catch(() => {});
    return;
  }
  if (cloudinaryConfigured()) {
    const cl = configureCloudinary();
    await cl.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
  }
}
