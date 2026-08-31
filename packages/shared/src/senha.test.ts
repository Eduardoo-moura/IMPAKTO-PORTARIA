import { describe, expect, it } from 'vitest';
import { gerarHash, senhaAtendeAoMinimo, senhaConfere } from './senha.js';

describe('R27 — hash compatível com o desktop C#', () => {
  it('gera no formato PBKDF2$50000$salt$hash', async () => {
    const hash = await gerarHash('portaria123');
    const partes = hash.split('$');
    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe('PBKDF2');
    expect(partes[1]).toBe('50000');
    expect(Buffer.from(partes[2]!, 'base64')).toHaveLength(16);
    expect(Buffer.from(partes[3]!, 'base64')).toHaveLength(32);
  });

  it('confere a senha que gerou', async () => {
    const hash = await gerarHash('portaria123');
    await expect(senhaConfere('portaria123', hash)).resolves.toBe(true);
    await expect(senhaConfere('portaria124', hash)).resolves.toBe(false);
  });

  it('usa salt novo a cada geração', async () => {
    const [a, b] = await Promise.all([gerarHash('igual'), gerarHash('igual')]);
    expect(a).not.toBe(b);
    await expect(senhaConfere('igual', a)).resolves.toBe(true);
    await expect(senhaConfere('igual', b)).resolves.toBe(true);
  });

  it('valida um hash produzido pelo C# — os 14 usuários migram sem trocar senha', async () => {
    // PBKDF2-SHA256, 50.000 iterações, salt de 16 bytes, hash de 32,
    // exatamente como Rfc2898DeriveBytes grava em Seguranca.cs.
    const { pbkdf2Sync } = await import('node:crypto');
    const salt = Buffer.alloc(16, 7);
    const esperado = pbkdf2Sync('admin', salt, 50_000, 32, 'sha256');
    const doDesktop = `PBKDF2$50000$${salt.toString('base64')}$${esperado.toString('base64')}`;

    await expect(senhaConfere('admin', doDesktop)).resolves.toBe(true);
    await expect(senhaConfere('outra', doDesktop)).resolves.toBe(false);
  });

  it('falha fechada em hash malformado', async () => {
    await expect(senhaConfere('x', '')).resolves.toBe(false);
    await expect(senhaConfere('x', null)).resolves.toBe(false);
    await expect(senhaConfere('x', 'texto solto')).resolves.toBe(false);
    await expect(senhaConfere('x', 'BCRYPT$1$a$b')).resolves.toBe(false);
    await expect(senhaConfere('x', 'PBKDF2$abc$YQ==$Yg==')).resolves.toBe(false);
    await expect(senhaConfere('x', 'PBKDF2$50000$$')).resolves.toBe(false);
  });
});

describe('senha mínima', () => {
  it('exige 8 caracteres na web — o desktop aceitava 4', () => {
    expect(senhaAtendeAoMinimo('1234')).toBe(false);
    expect(senhaAtendeAoMinimo('12345678')).toBe(true);
    expect(senhaAtendeAoMinimo(null)).toBe(false);
  });
});
