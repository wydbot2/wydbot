<ApiPageHeader ctx="Item" kind="tipo de dado" icon="cube" />

# Item

<p class="api-lead">Um item de equipamento ou do inventário. Aparece em <code>ctx.player.equipment</code>, <code>ctx.player.inventory</code> e no retorno de <code>find()</code>.</p>

<script setup>
import { data } from '../.vitepress/data/script-ctx.data.ts';
const iface = data.interfaces.find((i) => i.name === 'Item');
const immovableValues = [
  { value: '1', desc: 'Imóvel.' },
  { value: '2', desc: 'Não-transferível.' },
  { value: '3', desc: 'Vinculado ao personagem.' },
];
const useKindValues = [
  {
    value: `'direto'`,
    desc: 'Consumível de uso imediato (poção, alimento, Pergaminho da Água, convite, jóia…): use <code>item.use()</code>.',
  },
  {
    value: `'pergaminho'`,
    desc: 'Pergaminho de teleporte (Pedido de Caça, Retorno, Teleporte/Portal): use <code>item.scroll.use(...)</code>.',
  },
  {
    value: `'popup'`,
    desc: 'O jogo só mostra um aviso (Cristais, Pedra Ideal…): nada útil para o macro.',
  },
  {
    value: `'painel'`,
    desc: 'Abre uma janela do jogo (OptionStone, Poeiras de refino…): não dá para automatizar.',
  },
  {
    value: `'equipamento'`,
    desc: 'Não é consumível (equipa/move em vez de usar).',
  },
  {
    value: `'bloqueado'`,
    desc: 'O jogo ignora o uso (ex.: Jóia da Armazenagem).',
  },
];
</script>

<ApiTypePage :iface="iface">
  <template #after>
    <ApiEnum label="Valores de immovable" :items="immovableValues" />
    <ApiEnum label="Valores de useKind" :items="useKindValues" />
  </template>
</ApiTypePage>
