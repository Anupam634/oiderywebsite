import type { Config } from '../../config.ts';
import { hmacHex, randomDigits, safeEqual } from '../../lib/crypto.ts';

/* One-time passwords by SMS. Three providers:
   - dev: we make the code and show it in the API log (and to the browser, so demos work without SMS)
   - twilio: Twilio Verify sends and checks the code (handles India's DLT rules for us)
   - msg91: MSG91's OTP API (cheaper in India; needs a DLT-approved template)
   Twilio and MSG91 keep the code themselves, so we store no hash for them. */

export interface OtpStart {
  /** hash of our own code (dev provider) */
  codeHash?: string;
  /** shown to the browser by the dev provider only */
  devCode?: string;
}

export interface OtpProvider {
  readonly name: 'dev' | 'twilio' | 'msg91';
  start(phone: string): Promise<OtpStart>;
  check(phone: string, code: string, codeHash: string | null): Promise<boolean>;
}

export const OTP_LENGTH = 6;

export function createOtpProvider(config: Config, log: (msg: string) => void): OtpProvider {
  const hashOf = (phone: string, code: string) => hmacHex(config.FILE_SIGNING_SECRET, `otp:${phone}:${code}`);
  if (config.OTP_PROVIDER === 'twilio') {
    const base = `https://verify.twilio.com/v2/Services/${config.TWILIO_VERIFY_SERVICE_SID}`;
    const auth = 'Basic ' + Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
    const post = async (path: string, form: Record<string, string>) => {
      const res = await fetch(base + path, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
      const body = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
      if (!res.ok) throw new Error(`Twilio Verify ${res.status}: ${body.message ?? 'error'}`);
      return body;
    };
    return {
      name: 'twilio',
      start: async (phone) => (await post('/Verifications', { To: `+91${phone}`, Channel: 'sms' }), {}),
      check: async (phone, code) => (await post('/VerificationCheck', { To: `+91${phone}`, Code: code }).catch(() => ({ status: 'failed' }))).status === 'approved',
    };
  }
  if (config.OTP_PROVIDER === 'msg91') {
    const headers = { authkey: config.MSG91_AUTH_KEY!, accept: 'application/json' };
    return {
      name: 'msg91',
      async start(phone) {
        const u = new URL('https://control.msg91.com/api/v5/otp');
        u.search = new URLSearchParams({ template_id: config.MSG91_OTP_TEMPLATE_ID!, mobile: `91${phone}`, otp_length: String(OTP_LENGTH), otp_expiry: '10' }).toString();
        const res = await fetch(u, { method: 'POST', headers });
        const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
        if (!res.ok || body.type === 'error') throw new Error(`MSG91 ${res.status}: ${body.message ?? 'error'}`);
        return {};
      },
      async check(phone, code) {
        const u = new URL('https://control.msg91.com/api/v5/otp/verify');
        u.search = new URLSearchParams({ otp: code, mobile: `91${phone}` }).toString();
        const res = await fetch(u, { headers });
        const body = (await res.json().catch(() => ({}))) as { type?: string };
        return res.ok && body.type === 'success';
      },
    };
  }
  return {
    name: 'dev',
    async start(phone) {
      const code = config.OTP_DEV_CODE ?? randomDigits(OTP_LENGTH);
      log(`OTP for +91 ${phone}: ${code} (dev provider, no SMS sent)`);
      return { codeHash: hashOf(phone, code), devCode: code };
    },
    check: async (phone, code, codeHash) => !!codeHash && safeEqual(hashOf(phone, code), codeHash),
  };
}
