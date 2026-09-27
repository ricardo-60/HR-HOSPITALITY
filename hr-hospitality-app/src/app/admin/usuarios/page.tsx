import UsuariosManagementPage from '../../rh/usuarios/page';

/**
 * `/admin/usuarios` é o nome que o caderno de encargos dá ao painel de gestão
 * de utilizadores. A implementação vive em `/rh/usuarios` (a rota histórica,
 * já na barra lateral), por isso esta rota é um alias fino para o mesmo
 * componente — sem duplicar lógica nem divergir no futuro.
 */
export default function AdminUsuariosPage() {
    return <UsuariosManagementPage />;
}
