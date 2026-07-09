import { Keypair } from "@stellar/stellar-sdk";

export function verifySignature(publicKey: string, payload: string, signatureBase64: string): boolean {
  try {
    const keypair = Keypair.fromPublicKey(publicKey);
    const signature = Buffer.from(signatureBase64, "base64");
    return keypair.verify(Buffer.from(payload), signature);
  } catch (error) {
    return false;
  }
}
