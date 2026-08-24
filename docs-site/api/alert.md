<ApiPageHeader ctx="ctx.alert" kind="função · ação assíncrona" icon="bell" />

# alert

<p class="api-lead">Mostra um aviso na tela e <strong>pausa o macro</strong> até você clicar em <strong>Entendi</strong>. Use para chamar sua atenção.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const ctx = data.interfaces.find((i) => i.name === 'ScriptCtx');
const member = ctx.members.find((m) => m.name === 'alert');
</script>

<ApiSection :member="member" />
