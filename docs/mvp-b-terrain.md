# MVP B — terreno indisponível e verificações controladas

**Registro histórico da geração do dataset MVP B.** A aquisição foi resolvida posteriormente no [pacote de mudanças 1](landing-guide-package-1.md), para visualização topográfica. O dataset horário original conserva `topographic_visible: null`; sombras GPU não foram convertidas em novos resultados científicos.

## Resultado da aquisição nesta execução

Foram tentadas requisições HTTPS GET normais ao label candidato `LDEM_80S_80M` no PDS Geosciences, ao índice NASA PGDA e ao índice NASA LOLA. As três foram rejeitadas pelo proxy no CONNECT com **HTTP 403**, antes de receber metadados do produto. As URLs, horários e erros estão em [dem-access.json](evidence/mvp-b/dem-access.json).

Não foi adquirido DEM, não foi autenticado um hash de DEM e não foram verificados datum vertical, projeção, nodata ou referencial de um produto LOLA. Não se infere que o serviço esteja indisponível publicamente: a evidência é um bloqueio de acesso neste ambiente.

**A funcionalidade topográfica do produto permanece indisponível.** O dataset temporal não contém terreno sintético disfarçado de LOLA. Os locais do MVP A estão definidos em IAU_MOON; não se assume que números de coordenadas IAU_MOON e MOON_ME identifiquem o mesmo ponto físico.

## Primitiva matemática isolada e testes

`science/src/lunar_science/topographic_horizon.py` fornece somente uma primitiva de raios sobre uma esfera, sem leitor de DEM e sem integração à interface. Ela recebe explicitamente elevações radiais de um callback, em um referencial já compatibilizado pelo chamador. Não importa código da branch mission-pipeline.

- Raios seguem geodésicas da esfera de referência; latitude planetocêntrica, longitude leste `[0,360)` e azimute norte=0°, leste=90°.
- Altura do observador é medida acima do terreno consultado na origem, separada da elevação radial do terreno.
- A elevação angular usa a diferença radial e a curvatura lunar. Não substitui o horizonte tangente idealizado 0° do MVP A por um horizonte topográfico inventado.
- O callback deve retornar `None` ou lançar `TerrainUnavailable` em cada consulta sem cobertura/nodata; NaN e infinitos também falham. A função falha integralmente sem perfil parcial se uma consulta não for válida. Não há clipping de índices nem preenchimento por zero/borda.
- Grades inválidas, coordenadas inválidas, raios não positivos e altura negativa/não finita são rejeitados.
- Um perfil calculado cobre apenas os raios e distâncias fornecidos. Não comprova ausência de obstáculos entre os raios, além do alcance ou sob resolução subpixel.

Executado:

```sh
.venv/bin/python -m pytest science/tests/test_topographic_horizon.py -q
```

**25 testes passaram**. São testes de software analíticos e sintéticos, não validação de terreno lunar real:

1. Esfera lisa no solo: ângulo de cada ponto amostrado igual a `−distância/(2R)` em radianos.
2. Esfera lisa com observador a 2 m: comparação com depressão analítica do limbo `−acos(R/(R+h))`.
3. Montanha sintética de 100 m a 1000 m: comparação com ângulo analítico conhecido.
4. Borda de cratera sintética de desnível 100 m a 1000 m, simétrica no polo: consistência nos quatro azimutes cardeais.
5. Latitude, longitude leste/wrap, norte/leste e meridiano no polo.
6. Nodata na origem/no raio, erro explícito de cobertura/borda e entradas inválidas.

## Estudo mínimo de convergência — somente superfícies controladas

Resultados completos em [synthetic-horizon-checks.json](evidence/mvp-b/synthetic-horizon-checks.json).

Esfera lisa, raio 1.737.400 m e observador a 2 m, limbo analítico `−0,0869365719°`, alcance de 12 km:

| Passo radial | Horizonte amostrado | Erro absoluto analítico |
| --- | --- | --- |
| 320 m | −0,0869739791° | 0,0000374072° |
| 160 m | −0,0869739791° | 0,0000374072° |
| 80 m | −0,0869366617° | 0,0000000898° |
| 40 m | −0,0869366617° | 0,0000000898° |

Montanha sintética de 100 m a 1000 m no azimute 10°: raios de 20° omitem a montanha (máximo `−0,01648894°`); raios de 10° e 5° a resolvem (máximo `5,69394079°`). Isso demonstra o perigo de aliasing angular. Não estabelece uma resolução suficiente para LOLA, cujo relevo ainda não foi obtido.

## Condições necessárias para habilitar terreno real

1. Obter por fonte NASA/PDS/PGDA o label normativo e o DEM, com identificador/versão, URLs, horário, tamanho, hashes e evidência de integridade do distribuidor.
2. Verificar projeção, pixel registration/offsets, longitude positiva, latitude planetocêntrica ou planetográfica, datum/raio vertical, unidades, fator/offset de escala, sample type, endian, nodata e cobertura. Não inserir defaults silenciosos quando metadados essenciais estiverem ausentes.
3. Compatibilizar posições dos dois locais e efemérides com o referencial documentado pelo produto (ME/PA/DE421 ou outro). Se houver mudança do referencial do MVP A, torná-la explícita e testar a transformação com FK/PCK corretos; não renomear IAU_MOON como MOON_ME.
4. Implementar um adaptador que propague validade em origem, stencil e cada raio; nunca converter consulta fora da cobertura ou nodata em terreno conhecido.
5. Reproduzir perfis reais nos dois locais, verificar alcance e convergência radial/azimutal, e conservar seus hashes/metadados. Só então derivar séries topográficas dos centros do Sol/Terra, sem alegar energia ou enlace.
6. Guardar a incerteza espacial e temporal. Testes analíticos, mesmo passando, não constituem validação independente de LOLA, SPICE ou Horizons.

Até essas condições serem atendidas, a melhoria horária e o horizonte idealizado podem funcionar de forma independente, e a ausência de resultados topográficos deve continuar visível.
