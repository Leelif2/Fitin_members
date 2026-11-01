// 학생증 확인 (supabase/migrations/0023_student_id_verification.sql) — 회원가입 화면과 verify.html 공용.
// 사진은 브라우저에서 줄여(최대 1600px JPEG) 올린다: 용량을 줄이고, 휴대폰 사진에 들어 있는
// 위치(GPS) 같은 부가 정보도 이 과정에서 빠진다.

export const BUCKET = 'student-ids';
const MAX_SIDE = 1600;

export async function compressImage(file) {
  if (!file || !/^image\//.test(file.type || '')) throw codeError('photo_type');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // 일부 브라우저는 createImageBitmap이 없거나 HEIC를 못 읽는다 → <img>로 한 번 더 시도
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(codeError('photo_type'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width || bitmap.naturalWidth;
  const h = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw codeError('photo_type');
  return blob;
}

// 사진 올리기 → 학번과 함께 제출. 성공하면 'pending'
export async function submitStudentId({ supabase, userId, university, studentNo, file }) {
  const blob = await compressImage(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw codeError('upload_failed', upErr);
  const { data, error } = await supabase.rpc('submit_student_id', { p_university: university, p_student_no: studentNo, p_path: path });
  if (error) {
    // 제출이 안 됐으면 방금 올린 사진은 남기지 않는다
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw codeError(knownCode(error.message) || 'unknown', error);
  }
  return data;
}

const CODES = ['not_signed_in', 'already_approved', 'already_submitted', 'school_required', 'invalid_student_no', 'photo_required', 'student_no_taken', 'verification_required'];
function knownCode(message) {
  return CODES.find((c) => String(message || '').includes(c)) || null;
}

function codeError(code, cause) {
  const e = new Error(code);
  e.code = code;
  e.cause = cause;
  return e;
}

// 오류 코드 → [영어, 한국어]
export const ID_ERRORS = {
  photo_type: ['Please choose a photo file (JPG or PNG).', '사진 파일(JPG, PNG)을 골라 주세요.'],
  upload_failed: ['Couldn’t upload the photo. Check your connection and try again.', '사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'],
  invalid_student_no: ['Please check your student ID number.', '학번을 다시 확인해 주세요.'],
  student_no_taken: ['An account with this school and student ID number already exists. If this is you, log in with that account.', '이 학교·학번으로 가입된 계정이 이미 있어요. 본인이라면 그 계정으로 로그인해 주세요.'],
  school_required: ['Please choose your school.', '학교를 선택해 주세요.'],
  photo_required: ['Please add a photo of your student ID card.', '학생증 사진을 올려 주세요.'],
  already_submitted: ['You’ve already submitted. Please wait for approval.', '이미 제출했어요. 승인을 기다려 주세요.'],
  already_approved: ['You’re already approved.', '이미 승인됐어요.'],
  not_signed_in: ['Please log in first.', '먼저 로그인해 주세요.'],
  unknown: ['Something went wrong. Please try again shortly.', '문제가 생겼어요. 잠시 후 다시 시도해 주세요.'],
};
