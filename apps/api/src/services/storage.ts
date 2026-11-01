export const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg', 'pdf', 'zip', 'ai', 'eps'];
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export interface SignedUploadUrlResult {
  uploadUrl: string;
  path: string;
  expiresIn: number;
}

export async function createSignedUploadUrl(
  milestoneId: string,
  filename: string,
  contentType: string
): Promise<SignedUploadUrlResult> {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `INVALID_FILE_TYPE: File extension '.${ext}' is not permitted. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    );
  }

  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `submissions/${milestoneId}/${Date.now()}-${cleanFilename}`;

  // If live Supabase storage configured
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const uploadUrl = `${process.env.SUPABASE_URL}/storage/v1/object/submissions/${path}`;
    return { uploadUrl, path, expiresIn: 3600 };
  }

  // Local sandbox simulation URL
  const uploadUrl = `http://localhost:${process.env.PORT || 8080}/mock-storage/${path}`;
  return { uploadUrl, path, expiresIn: 3600 };
}

export async function getSignedDownloadUrls(paths: string[]): Promise<string[]> {
  return paths.map((p) => {
    if (process.env.SUPABASE_URL) {
      return `${process.env.SUPABASE_URL}/storage/v1/object/public/submissions/${p}`;
    }
    return `http://localhost:${process.env.PORT || 8080}/mock-storage/${p}`;
  });
}
