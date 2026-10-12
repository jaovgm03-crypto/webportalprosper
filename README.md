# WebGIS Prosper — Mina Cuité | Versão 1.2

Versão 1.2 do WebGIS Prosper. Publicação autorizada pelo responsável em 12/10/2026, após revisão local.

## Uso local

Abra `iniciar_portal.bat` e acesse http://127.0.0.1:8082/. Alternativamente, execute `node server.cjs` nesta pasta. A porta 8082 separa esta prévia da versão anterior na porta 8081. A prévia atende somente este computador.

## Organização

- `dist`: aplicação, dados preparados dos nove meses, seis referências, bibliotecas e identidade visual.
- `scripts`: processamento atual, validação e testes; scripts históricos de modificação da versão anterior foram excluídos desta cópia.
- `python_packages`: dependências locais para processamento; não são publicadas.
- `.git`: histórico independente, sem vínculos com a pasta antiga, e conexão com o repositório existente.
- `tmp`: resultados descartáveis de testes; não são publicados.

As bases originais são compartilhadas nas pastas `../3d`, `../curvas_nivel`, `../mdt`, `../ortofoto`, `../vetores_referencia`, `../volume_pilhas` e `../identidade_visual`. Mantenha esta organização. Não é necessário manter as pastas antigas de desenvolvimento para executar ou atualizar esta versão.

## Arquivos

O botão **Arquivos** concentra downloads KMZ de referências, curvas, ortofoto e medições, além dos acessos ao PDF, PNG 3D e CSV de volumes. As escolhas de download não alteram a visibilidade no mapa. Um mês é selecionado por pacote; PDF e PNG continuam independentes por painel.

As ortofotos KMZ usam a resolução otimizada do portal, reprojetada de EPSG:3857 para EPSG:4326, com a imagem incorporada ao arquivo. Não substituem os GeoTIFFs originais. Polígonos, linhas e atributos são preservados; estilos são adaptados aos recursos KML (não há tracejado de linha padrão).

A importação aceita KML e KMZ com pontos, linhas e polígonos. A exportação de feições e medições oferece somente KMZ. Os arquivos são processados em memória no navegador, sem upload ou armazenamento persistente; recarregar ou fechar a aba limpa a sessão. Nenhum recurso externo do arquivo é carregado. Imagens, modelos e trajetórias especiais não são importados. O enquadramento não muda automaticamente. Avisos fora da extensão dos levantamentos usam seus retângulos geográficos, não limites municipais nem a máscara exata de pixels válidos.

Limites: arquivo KMZ de até 32 MiB, arquivo/documento KML até 16 MiB, soma declarada dos conteúdos até 64 MiB, 256 entradas ZIP, 10.000 feições e 300.000 vértices por arquivo; seis arquivos e 400.000 vértices por sessão. KML aceita UTF-8 ou UTF-16 com marcador de codificação. A leitura e a descompactação ocorrem em worker, limitadas também pelo tamanho real e por 15 segundos. CRC, estrutura ZIP, coordenadas e XML são validados. DTD, entidades declaradas, conexões de rede, arquivos cifrados e ZIP64 são recusados. Atributos são apresentados como texto, nunca HTML executável. Anexos do KMZ não são executados nem extraídos para disco.

## Atualizar os dados

Execute `scripts/update_surveys.py` com o Python do QGIS. Ele usa as bases compartilhadas e chama a geração das malhas, cinco classes comuns de elevação, imagens móveis e imagens KMZ. Para regenerar somente as imagens KMZ, execute `scripts/prepare_kmz.py`.

## Validar

Execute `node scripts/validate.mjs` e os scripts `test_*.mjs`. As verificações geoespaciais Python usam GDAL/OGR pelo QGIS. Os testes não publicam dados.

## Publicação

O `vercel.json` publica somente `dist`, sem servidor permanente. Importações temporárias nunca entram na publicação. Não exclua as pastas anteriores antes de validar a versão local e a publicação.
