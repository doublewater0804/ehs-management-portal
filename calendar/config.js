// 與 EHS 入口網站共用已存在的 Firebase Web 設定；無需填寫第二份。
// Web config 是公開的客戶端識別資訊，不包含服務帳戶私鑰。
export {firebaseConfig, ADMIN_EMAIL as allowedEmail} from '../portal/config.js';
export const tz = 'Asia/Taipei';
