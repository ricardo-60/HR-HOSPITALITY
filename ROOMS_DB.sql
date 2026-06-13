-- 1. Criar o Tipo ENUM para o Estado do Quarto
CREATE TYPE hotel_room_status AS ENUM ('DISPONIVEL', 'OCUPADO', 'LIMPEZA', 'MANUTENCAO');

-- 2. Criar a Tabela Física de Quartos
CREATE TABLE public.hotel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- Herdado do ecossistema HR-GESTPRO 2.0 para Multitenancy
    room_number VARCHAR(20) NOT NULL,
    room_type VARCHAR(50) NOT NULL, -- Ex: Single, Double, Suite Premium
    status hotel_room_status DEFAULT 'DISPONIVEL',
    price_per_night DECIMAL(10, 2) NOT NULL,
    floor INT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Garante que o mesmo número de quarto não se repete no mesmo hotel/tenant
    CONSTRAINT unique_room_per_tenant UNIQUE (tenant_id, room_number)
);

-- 3. Habilitar o Row Level Security (RLS) para Segurança e Isolamento de Dados
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;

-- 4. Criar a Política de Segurança (Herdada do GestPro 2.0)
CREATE POLICY "Permitir leitura/escrita apenas para membros do mesmo Tenant" 
ON public.hotel_rooms
FOR ALL
USING (
    tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
);

-- 5. Aplicar o Trigger de Auditoria Temporal (update_modified_column)
CREATE TRIGGER update_hotel_rooms_modtime
    BEFORE UPDATE ON public.hotel_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
