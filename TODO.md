# TODO — Ajustes Finais e Leitor de Código de Barras "do mercado"

## Backend
- [x] Estoque.js: permitir registrar entrada informando `barcode` (sem precisar selecionar na lista)

## Frontend — Scanner
- [x] Detectar leitura de código de barras por teclado/leitor USB (acúmulo + Enter)
- [x] Beep sonoro + flash verde de confirmação ao escanear
- [x] Linha de scan animada na câmera + indicador de leitura
- [x] Auto-focus no campo de busca manual
- [x] Mostrar categoria, preço médio e status do produto
- [x] Botão "Registrar entrada" que abre modal com o produto escaneado pré-carregado
- [x] Fluxo de novo produto: escanear código inexistente → cadastrar → registrar entrada

## Estilos
- [x] Corrigir duplicação de `.result-item strong/span` no styles.css
- [x] Adicionar estilos de linha de scan, flash de leitura, modal de entrada e visual de lotes

## Docs
- [x] Atualizar README.md com instruções do leitor USB e melhorias do scanner

## Testes
- [x] Rodar backend + frontend e validar os fluxos do scanner
