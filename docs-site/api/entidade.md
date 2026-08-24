<ApiPageHeader ctx="Entidade" kind="tipo de dado" icon="stack" />

# Entidade

<p class="api-lead">O formato de cada entrada de <code>ctx.npcs</code>, <code>ctx.monsters</code> e <code>ctx.otherPlayers</code>.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const iface = data.interfaces.find((i) => i.name === 'Entidade');
</script>

<ApiTypePage :iface="iface" />
