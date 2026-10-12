# Revisão local — 12/10/2026

## Ajustes desta revisão

- Importação temporária de KML e KMZ; exportação de feições e medições somente em KMZ.
- KML e conteúdo KML do KMZ seguem a mesma validação de geometrias, coordenadas, atributos e referências externas.
- Leitura de KML UTF-8 e UTF-16; limites de 16 MiB para KML e 32 MiB para KMZ.
- Botões dos vértices legíveis no modo escuro, incluindo seleção, passagem do cursor e foco do teclado. Seleção em azul Lithos.
- Cabeçalho das informações das curvas com fundo azul e texto branco nos dois temas; contraste das indicações de área e curva mestra ajustado nos temas claro e escuro.

## Escopo conferido no código

- Botão Arquivos reúne camadas de referência, curvas de nível, ortofoto e medições. PDF, PNG 3D e CSV de volumes continuam disponíveis nesse painel.
- Importações somente em memória nesta aba, sem envio ao servidor. Recarregar remove a sessão.
- Pontos, linhas, polígonos e anéis internos suportados; atributos apresentados como texto.
- Arquivos fora da extensão dos levantamentos recebem aviso, sem bloqueio municipal nem mudança automática de enquadramento. Há ações Localizar e Voltar à mina.
- Somente ADA e Hidrografia começam habilitadas. Atributos abrem por clique; resumos ao passar o cursor continuam removidos.
- PDF e PNG por painel/mês; medições 3D exportadas como geometrias 2D no KMZ.
- A pasta atual não depende das pastas antigas de desenvolvimento. As bases originais continuam nas pastas compartilhadas descritas no README.

## Verificações executadas nesta data

- `validate.mjs`: nove levantamentos, seis referências, atributos originais e coordenadas.
- `test_profile.mjs` e `test_terrain_area.mjs`: distâncias, inclinação, interpolação, áreas planas/inclinadas, orientação, interseções e ausência de dados.
- `test_print_layout.mjs`: dimensões A4, orientações e margens, sem deformação.
- `test_kml.mjs` e `test_files.mjs`: exportação 2D, escape XML, ZIP armazenado/comprimido, CRC, arquivos truncados, limites de descompactação e leitura KML UTF-8/UTF-16.
- `test_geopdf.mjs` e `check_geopdf.py`: PDF sintético reconhecido e renderizado pelo GDAL, coordenadas dos cantos verificadas. O renderizador emitiu avisos de fontes Symbol/ArialUnicode; a verificação geoespacial passou.
- `check_files.py`: pacote de setembro com 850 feições, atributos e ortofoto incorporada; nove ortofotos com dimensões, transparência e limites verificados.
- `check_kmz.py`: integridade ZIP/XML, geometrias 2D e leitura OGR; conversão UTM com diferença inferior a 2 cm.

## Validação no navegador

A ferramenta de automação visual não iniciou nesta sessão devido a falha do ambiente local. Foi possível executar a página de testes no navegador do aplicativo e receber seus resultados pelo servidor de testes local: **21 testes passaram, nenhum falhou**, em 12/10/2026 às 19:05 UTC. Resultado em `tmp/browser-test-result.json`.

Foram conferidos: importação real por worker de KML/KMZ, pontos/linhas/polígonos com anel interno, atributos apresentados como texto, rejeição de arquivos inválidos e conexões externas, inclusão nos dois mapas sem alterar o enquadramento, aviso fora da cobertura, visibilidade, remoção e cancelamento. A página também carrega os estilos reais do portal e verifica contraste mínimo de 4,5:1 nos botões de vértices normais/selecionados, títulos e indicações de medição nos dois temas. Esse teste detectou e permitiu corrigir um problema adicional de contraste de curva mestra no tema claro.

Para repetir: gerar as amostras com `node scripts/test_files.mjs`, iniciar `node scripts/test_server.cjs` e abrir `http://127.0.0.1:8083/scripts/files-browser-tests.html`. O servidor de testes não faz parte de `dist` nem da publicação.

A conferência manual da aparência e de todos os percursos da interface não foi repetida integralmente nesta sessão. A prévia em `http://127.0.0.1:8082/` está disponível para a validação final do responsável antes de publicar.

Nenhuma publicação, push ou exclusão das pastas anteriores foi realizada nesta revisão.
