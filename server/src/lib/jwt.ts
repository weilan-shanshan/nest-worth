import { SignJWT, jwtVerify, importPKCS8, importSPKI, type CryptoKey } from 'jose';

const ALG = 'EdDSA';
const ISSUER = 'nestworth.app';

const privB64 = process.env.JWT_PRIVATE_KEY;
const pubB64 = process.env.JWT_PUBLIC_KEY;
if (!privB64 || !pubB64) {
  console.error('[fatal] JWT_PRIVATE_KEY / JWT_PUBLIC_KEY is not set');
  process.exit(1);
}

function reconstructPem(b64: string, kind: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  // 把 .env 里压成单行的 base64 还原成 PEM 多行格式
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN ${kind}-----\n${lines}\n-----END ${kind}-----\n`;
}

let privateKey: CryptoKey | null = null;
let publicKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (!privateKey) {
    privateKey = await importPKCS8(reconstructPem(privB64!, 'PRIVATE KEY'), ALG);
  }
  return privateKey;
}

async function getPublicKey(): Promise<CryptoKey> {
  if (!publicKey) {
    publicKey = await importSPKI(reconstructPem(pubB64!, 'PUBLIC KEY'), ALG);
  }
  return publicKey;
}

/**
 * 签发用户会话 JWT。
 * payload 极简：sub=user_id，tier=订阅档；其余服务端按需查 DB。
 */
export interface SessionClaims {
  sub: string;              // user_id
  tier: 'free' | 'plus' | 'pro' | 'max' | 'studio';
}

export async function signSession(claims: SessionClaims, ttlSec = 60 * 60 * 24 * 7): Promise<string> {
  const key = await getPrivateKey();
  return new SignJWT({ tier: claims.tier })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(key);
}

export interface VerifiedSession {
  userId: string;
  tier: SessionClaims['tier'];
  exp: number;
}

export async function verifySession(jwt: string): Promise<VerifiedSession | null> {
  try {
    const key = await getPublicKey();
    const { payload } = await jwtVerify(jwt, key, { issuer: ISSUER });
    if (!payload.sub || !payload.exp) return null;
    return {
      userId: payload.sub,
      tier: (payload.tier as SessionClaims['tier']) ?? 'free',
      exp: payload.exp
    };
  } catch {
    return null;
  }
}
