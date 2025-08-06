declare module 'mastercard-oauth1-signer' {
  export function getAuthorizationHeader(
    uri: string,
    method: string,
    payload: any,
    consumerKey: string,
    signingKey: string
  ): string;
}