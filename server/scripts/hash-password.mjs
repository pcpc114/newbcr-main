// 사용자 비밀번호를 bcrypt 해시로 바꿔주는 도구.
// users 테이블의 password_hash 컬럼에 넣을 값을 만든다.
//
// 사용법:
//   node scripts/hash-password.mjs "내비밀번호"
//
// 출력된 해시를 Supabase 대시보드의 SQL Editor 에서 이렇게 넣는다:
//   INSERT INTO users (username, password_hash, expiry_at)
//   VALUES ('아이디', '<여기에 해시>', now() + interval '30 days');

import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("사용법: node scripts/hash-password.mjs \"비밀번호\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log(hash);
