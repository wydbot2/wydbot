<ApiPageHeader ctx="ItemShort" kind="tipo de dado" icon="tag" />

# ItemShort

<p class="api-lead">Uma peça visível no corpo de uma <a href="./entidade.html">Entidade</a> — só id e nome, sem atributos.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const iface = data.interfaces.find((i) => i.name === 'ItemShort');
</script>

<ApiTypePage :iface="iface" />
