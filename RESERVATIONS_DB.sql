/* ============================================================
   FLUXO DE RESERVAS - EXTENSÃO HR-HOSPITALITY
   ============================================================ */

-- Tabela para armazenar as reservas originadas do site institucional
CREATE TABLE IF NOT EXISTS public.hotel_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    guest_name text NOT NULL,
    email text NOT NULL,
    service_type text NOT NULL CHECK (service_type IN ('quarto', 'conferencia', 'restaurante', 'transfer')),
    room_number text, -- Definido após a efetivação / alocação de quarto
    status text DEFAULT 'PENDENTE_PAGAMENTO' CHECK (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADA')),
    reservation_date date NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;

-- Política de Leitura (Qualquer funcionário da própria empresa/tenant)
CREATE POLICY reservations_read_policy ON public.hotel_reservations
    FOR SELECT
    USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Política de Inserção Pública (Necessário para que o formulário do site envie reservas sem login)
-- Nota: Caso queira proteger, adicione validação de recaptcha ou token de site estático
CREATE POLICY reservations_insert_policy ON public.hotel_reservations
    FOR INSERT
    WITH CHECK (true);

-- Política de Atualização (Apenas funcionários ADMIN ou MASTER da própria empresa/tenant)
CREATE POLICY reservations_update_policy ON public.hotel_reservations
    FOR UPDATE
    USING (
      tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
      AND (
        SELECT role FROM public.user_profiles WHERE id = auth.uid()
      ) IN ('ADMIN', 'MASTER')
    );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON public.hotel_reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON public.hotel_reservations(created_at DESC);
