# Fontes locais

Inter e Geist Mono usam os mesmos arquivos WOFF2 Latin do pacote anterior conferido em 2026-10-14. Os bytes permanecem iguais; provenance.json registra tamanho e SHA256. O CSS da exportacao anterior usava esses arquivos para pesos400,500e600 e caracteres portugueses.

layout.tsx usa next/font/local para que o build nao consulte Google Fonts. Isso evita o erro de URLs sem extensao relatado em https://github.com/vercel/next.js/issues/99114. A documentacao de carregamento local esta em https://nextjs.org/docs/app/api-reference/components/font#local-fonts.

As licencas SIL Open Font License1.1, com os copyrights dos respectivos projetos, acompanham o site em /fonts/inter-OFL.txt e /fonts/geistmono-OFL.txt. Os arquivos foram copiados das fontes oficiais de Google Fonts registradas em provenance.json. Nao alteramos o desenho das fontes.
