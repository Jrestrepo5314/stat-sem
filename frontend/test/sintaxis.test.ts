import { describe, expect, it } from 'vitest'
import { analizar, generar, iguales, modeloVacio, nombreLatenteLibre, proponerCadena, proponerMedicion, soloMedicion } from '../src/sem/sintaxis'
import { disponer } from '../src/sem/disposicion'

const EJEMPLO = `
# medición
clima =~ cli1 + cli2 + cli3
compromiso =~ com1 + com2 + com3
# estructural
compromiso ~ clima
desempeno ~ compromiso + edad
cli1 ~~ cli2
`

describe('analizar', () => {
  it('separa latentes, observadas y relaciones', () => {
    const { modelo, errores } = analizar(EJEMPLO)
    expect(errores).toEqual([])
    expect(modelo.latentes).toEqual(['clima', 'compromiso'])
    expect(modelo.observadas.sort()).toEqual(['cli1', 'cli2', 'cli3', 'com1', 'com2', 'com3', 'desempeno', 'edad'])
    expect(modelo.cargas).toHaveLength(6)
    expect(modelo.regresiones).toEqual([['compromiso', 'clima'], ['desempeno', 'compromiso'], ['desempeno', 'edad']])
    expect(modelo.covarianzas).toEqual([['cli1', 'cli2']])
  })

  it('ignora coeficientes fijados y varianzas propias', () => {
    const { modelo } = analizar('f =~ 1*a + b\na ~~ a\nb ~~ 0.3*a')
    expect(modelo.cargas).toEqual([['f', 'a'], ['f', 'b']])
    expect(modelo.covarianzas).toEqual([['b', 'a']])
  })

  it('reporta líneas que no entiende sin abortar', () => {
    const { modelo, errores } = analizar('f =~ a + b\nesto no es nada\nf2 =~ 1c')
    expect(errores).toHaveLength(2)
    expect(modelo.latentes).toEqual(['f', 'f2'])
    expect(modelo.cargas).toEqual([['f', 'a'], ['f', 'b']])
  })
})

describe('generar', () => {
  it('es inversa de analizar salvo comentarios y orden', () => {
    const { modelo } = analizar(EJEMPLO)
    const texto = generar(modelo)
    expect(texto).toBe(['clima =~ cli1 + cli2 + cli3', 'compromiso =~ com1 + com2 + com3',
      'compromiso ~ clima', 'desempeno ~ compromiso + edad', 'cli1 ~~ cli2'].join('\n'))
    expect(iguales(analizar(texto).modelo, modelo)).toBe(true)
  })

  it('omite latentes sin indicadores porque no se pueden expresar', () => {
    const m = modeloVacio(); m.latentes = ['F1']
    expect(generar(m)).toBe('')
  })
})

describe('iguales y nombres', () => {
  it('no depende del orden ni del sentido de las covarianzas', () => {
    const a = analizar('f =~ x + y\nx ~~ y').modelo
    const b = analizar('f =~ y + x\ny ~~ x').modelo
    expect(iguales(a, b)).toBe(true)
    expect(iguales(a, analizar('f =~ x + y').modelo)).toBe(false)
  })
  it('propone un nombre de latente que no choca', () => {
    const m = analizar('F1 =~ a + F2').modelo
    expect(nombreLatenteLibre(m)).toBe('F3')
  })
})

describe('disponer', () => {
  it('pone los exógenos a la izquierda y los indicadores debajo de su latente', () => {
    const { modelo } = analizar(EJEMPLO)
    const pos = disponer(modelo)
    expect(pos.clima.x).toBeLessThan(pos.compromiso.x)
    expect(pos.cli1.y).toBeGreaterThan(pos.clima.y)
    expect(pos.edad.y).toBeLessThan(pos.clima.y)     // observada suelta, arriba
    expect(Object.keys(pos)).toHaveLength(10)
  })
  it('respeta las posiciones previas', () => {
    const { modelo } = analizar('f =~ a + b')
    const pos = disponer(modelo, { a: { x: 999, y: 999 } })
    expect(pos.a).toEqual({ x: 999, y: 999 })
    expect(pos.b.y).toBe(340)
  })
})

describe('propuestas automáticas', () => {
  const ENCUESTA = ['id', 'cli1', 'cli2', 'cli3', 'com1', 'com2', 'com3', 'des1', 'des2', 'des3', 'sexo', 'area', 'antiguedad', 'salario']

  it('agrupa los ítems por prefijo y nombra el constructo en mayúsculas', () => {
    const m = proponerMedicion(ENCUESTA)
    expect(m.latentes).toEqual(['CLI', 'COM', 'DES'])
    expect(m.cargas).toEqual([['CLI', 'cli1'], ['CLI', 'cli2'], ['CLI', 'cli3'], ['COM', 'com1'], ['COM', 'com2'], ['COM', 'com3'], ['DES', 'des1'], ['DES', 'des2'], ['DES', 'des3']])
    expect(m.observadas).not.toContain('id')
    expect(m.observadas).not.toContain('salario')
    expect(m.regresiones).toEqual([])
  })

  it('admite separadores y deja fuera los grupos de un solo ítem', () => {
    const m = proponerMedicion(['fu_1', 'fu_2', 'up.1', 'up.2', 'x1', 'edad'])
    expect(m.latentes).toEqual(['FU', 'UP'])
    expect(m.observadas).toEqual(['fu_1', 'fu_2', 'up.1', 'up.2'])
  })

  it('el modelo propuesto se escribe y se vuelve a leer igual', () => {
    const m = proponerMedicion(ENCUESTA)
    expect(iguales(analizar(generar(m)).modelo, m)).toBe(true)
  })

  it('la cadena enlaza los constructos en orden', () => {
    const m = proponerCadena(proponerMedicion(ENCUESTA))
    expect(m.regresiones).toEqual([['COM', 'CLI'], ['DES', 'COM']])
  })

  it('solo medición quita las regresiones y las observadas que solo eran predictores', () => {
    const m = analizar('f =~ a + b + c\ng =~ d + e\ng ~ f + edad\na ~~ b').modelo
    const cfa = soloMedicion(m)
    expect(cfa.regresiones).toEqual([])
    expect(cfa.observadas.sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(cfa.covarianzas).toEqual([['a', 'b']])
  })
})
