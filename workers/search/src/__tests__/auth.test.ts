import { describe, test, expect } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { verifyTokenWithKeys, corsHeaders, bearer } from '../auth'

const PROJECT = 'studio-whence-dpb'

async function tokenFor(email: string) {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
  const jwt = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(PROJECT)
    .setSubject('uid-1')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
  return { jwt, jwks: { keys: [jwk] } }
}

describe('verifyTokenWithKeys', () => {
  test('accepts a well-formed token and returns the email lowercased', async () => {
    const { jwt, jwks } = await tokenFor('Person@Thothica.com')
    expect(await verifyTokenWithKeys(jwt, PROJECT, jwks)).toEqual({ email: 'person@thothica.com' })
  })

  test('rejects a token for another project', async () => {
    const { jwt, jwks } = await tokenFor('a@b.c')
    expect(await verifyTokenWithKeys(jwt, 'someone-else', jwks)).toBeNull()
  })

  test('rejects a token with no email claim', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT).setSubject('u').setIssuedAt().setExpirationTime('1h')
      .sign(privateKey)
    expect(await verifyTokenWithKeys(jwt, PROJECT, { keys: [jwk] })).toBeNull()
  })

  test('rejects a token signed by the wrong key', async () => {
    const { jwt } = await tokenFor('a@b.c')
    const other = await tokenFor('a@b.c')
    expect(await verifyTokenWithKeys(jwt, PROJECT, other.jwks)).toBeNull()
  })

  test('rejects garbage without throwing', async () => {
    const { jwks } = await tokenFor('a@b.c')
    expect(await verifyTokenWithKeys('not-a-jwt', PROJECT, jwks)).toBeNull()
  })
})

describe('bearer', () => {
  test('extracts the token', () => {
    expect(bearer(new Request('https://w', { headers: { Authorization: 'Bearer abc' } }))).toBe('abc')
  })
  test('returns null with no header or a wrong scheme', () => {
    expect(bearer(new Request('https://w'))).toBeNull()
    expect(bearer(new Request('https://w', { headers: { Authorization: 'Basic abc' } }))).toBeNull()
  })
})

describe('corsHeaders', () => {
  const allowed = 'https://dpb.studiowhence.com,http://localhost:5509'
  test('echoes an allowed origin', () => {
    expect(corsHeaders('http://localhost:5509', allowed)['Access-Control-Allow-Origin'])
      .toBe('http://localhost:5509')
  })
  test('sends no ACAO for an unknown origin', () => {
    expect(corsHeaders('https://evil.example', allowed)['Access-Control-Allow-Origin'])
      .toBeUndefined()
  })
})
