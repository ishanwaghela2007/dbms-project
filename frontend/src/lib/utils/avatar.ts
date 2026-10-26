const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "ka5vsref";

/**
 * Resolves an avatar public_id, local upload ID, or URL into a displayable image URL.
 */
export function getAvatarUrl(publicIdOrUrl: string | undefined | null): string | undefined {
  if (!publicIdOrUrl) return undefined;
  const str = String(publicIdOrUrl).trim();
  if (!str) return undefined;

  // If already a full URL or blob
  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("blob:") || str.startsWith("data:")) {
    return str;
  }

  // If local backend upload fallback
  if (str.startsWith("local:")) {
    const clean = str.replace(/^local:/, "");
    const backendBase = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "https://college-erp-backend-gr0k.onrender.com/api/v1").replace(/\/api\/v1\/?$/, "");
    return `${backendBase}/api/v1/uploads/${clean}`;
  }

  // Cloudinary CDN URL with face detection & auto format
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/c_fill,g_face,w_200,h_200,q_auto,f_auto/${str}`;
}
