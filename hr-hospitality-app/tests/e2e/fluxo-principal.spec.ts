import { test, expect } from '@playwright/test';

test.describe('Segurança de autenticação', () => {
  test('login exige email e não oferece cadastro público', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Iniciar Sessão', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('nome@hotellukweku.ao')).toBeVisible();
    await expect(page.getByText('O acesso é atribuído exclusivamente por convite administrativo')).toBeVisible();
    await expect(page.getByText('Registar Conta', { exact: false })).toHaveCount(0);
  });

  test('rota de cadastro apresenta apenas a política de convite', async ({ page }) => {
    await page.goto('/cadastro');

    await expect(page.getByText('Registo Público Desativado')).toBeVisible();
    await expect(page.getByText('as contas são criadas por convite', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /criar/i })).toHaveCount(0);
  });
});
