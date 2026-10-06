/** Connection parameters guacd asks for while connecting ("required"
 *  instruction), e.g. RDP with NLA or a VNC password when the connection
 *  stores none. The names are guacd's parameter names. */
export type KnownParameter = 'username' | 'password' | 'domain' | 'passphrase';

export type Autocomplete = 'username' | 'current-password' | 'off';

export interface CredentialField {
  /** guacd's parameter name, sent back verbatim. */
  name: string;
  /** Known names get a translated label; anything else shows its name. */
  known: KnownParameter | null;
  secret: boolean;
  autocomplete: Autocomplete;
}

const KNOWN: Record<KnownParameter, { secret: boolean; autocomplete: Autocomplete }> = {
  username: { secret: false, autocomplete: 'username' },
  password: { secret: true, autocomplete: 'current-password' },
  domain: { secret: false, autocomplete: 'off' },
  passphrase: { secret: true, autocomplete: 'off' },
};

function isKnown(name: string): name is KnownParameter {
  return Object.hasOwn(KNOWN, name);
}

/** Form fields in the order guacd asked for them, duplicates dropped.
 *  Unknown names are treated as secret: guacd only asks for values that
 *  belong to the login, and showing one in clear is the worse mistake. */
export function credentialFields(parameters: readonly string[]): CredentialField[] {
  const seen = new Set<string>();
  const fields: CredentialField[] = [];
  for (const name of parameters) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    fields.push(
      isKnown(name)
        ? { name, known: name, ...KNOWN[name] }
        : { name, known: null, secret: true, autocomplete: 'off' },
    );
  }
  return fields;
}
