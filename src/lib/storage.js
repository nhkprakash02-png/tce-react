// Profile photo upload — new. Enforces the 1MB client-side cap before ever touching the
// network (protects the Firebase Storage free tier quota), then uploads to
// `profile-photos/{studentId}` and returns the public download URL to save onto the
// student's Firestore record.
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { fbStorage } from '../firebase';

export const MAX_PROFILE_PHOTO_BYTES = 1024 * 1024; // 1MB

export async function uploadProfilePhoto(file, studentId) {
  if (!fbStorage) throw new Error('Photo storage is not available right now. Please try again later.');
  if (!file) throw new Error('No file selected.');
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG, etc).');
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — please choose one under 1MB (try a smaller photo, or compress/resize it first).`);
  }
  const storageRef = ref(fbStorage, `profile-photos/${studentId}`);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}
