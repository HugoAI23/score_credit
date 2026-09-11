"""
Pruebas de la API (solo usan la librería estándar unittest y el cliente de pruebas de Flask).

Uso:
    python train_model.py     # si todavía no existen los artefactos en models/
    python -m unittest test_api -v
"""
import unittest

from app import app, METADATOS


class PruebasAPI(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        app.config['TESTING'] = True
        cls.cliente = app.test_client()

    def test_health(self):
        r = self.cliente.get('/api/v1/health')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['status'], 'ok')

    def test_model_incluye_curva_del_codo(self):
        datos = self.cliente.get('/api/v1/model').get_json()
        self.assertEqual(datos['k'], METADATOS['k'])
        self.assertEqual(len(datos['elbow']), 15)
        self.assertIsNone(datos['elbow'][0]['silhouette'])  # La silueta no existe con k = 1

    def test_segments(self):
        datos = self.cliente.get('/api/v1/segments').get_json()
        self.assertEqual(len(datos['segments']), METADATOS['k'])
        self.assertEqual(sum(s['customers'] for s in datos['segments']), 200)

    def test_segmento_inexistente(self):
        r = self.cliente.get('/api/v1/segments/99')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.get_json()['error']['code'], 'segment_not_found')

    def test_predict_cliente_premium(self):
        # Ingreso alto y gasto alto: debe caer en el segmento Premium
        r = self.cliente.post('/api/v1/predict', json={'age': 32, 'annual_income_k': 90, 'spending_score': 85})
        self.assertEqual(r.status_code, 200)
        datos = r.get_json()
        self.assertEqual(datos['segment']['name'], 'Premium')
        self.assertEqual(datos['distances'][0]['segment_id'], datos['segment']['id'])
        self.assertTrue(0 <= datos['assignment_margin'] <= 1)
        self.assertEqual(datos['warnings'], [])

    def test_predict_acepta_numeros_como_texto(self):
        r = self.cliente.post('/api/v1/predict', json={'age': '40', 'annual_income_k': '60', 'spending_score': '50'})
        self.assertEqual(r.status_code, 200)

    def test_predict_advierte_extrapolacion(self):
        r = self.cliente.post('/api/v1/predict', json={'age': 85, 'annual_income_k': 60, 'spending_score': 50})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['warnings'][0]['field'], 'age')

    def test_predict_validacion(self):
        r = self.cliente.post('/api/v1/predict', json={'age': 10, 'annual_income_k': 'abc'})
        self.assertEqual(r.status_code, 422)
        campos = {e['field'] for e in r.get_json()['error']['details']['fields']}
        self.assertEqual(campos, {'age', 'annual_income_k', 'spending_score'})

    def test_predict_rechaza_booleanos(self):
        r = self.cliente.post('/api/v1/predict', json={'age': True, 'annual_income_k': 50, 'spending_score': 50})
        self.assertEqual(r.status_code, 422)

    def test_predict_json_invalido(self):
        r = self.cliente.post('/api/v1/predict', data='no es json', content_type='text/plain')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()['error']['code'], 'invalid_json')

    def test_batch_mezcla_validos_e_invalidos(self):
        cuerpo = {'customers': [
            {'customer_ref': 'A1', 'age': 25, 'annual_income_k': 20, 'spending_score': 80},
            {'customer_ref': 'A2', 'age': 200, 'annual_income_k': 20, 'spending_score': 80},
            {'customer_ref': 'A3', 'age': 45, 'annual_income_k': 90, 'spending_score': 10},
        ]}
        datos = self.cliente.post('/api/v1/predict/batch', json=cuerpo).get_json()
        self.assertEqual(datos['summary'], {**datos['summary'], 'received': 3, 'processed': 2, 'rejected': 1})
        self.assertEqual(datos['errors'][0]['customer_ref'], 'A2')
        self.assertEqual([r['index'] for r in datos['results']], [0, 2])

    def test_batch_vacio(self):
        r = self.cliente.post('/api/v1/predict/batch', json={'customers': []})
        self.assertEqual(r.status_code, 400)

    def test_customers_filtrados(self):
        datos = self.cliente.get('/api/v1/customers?segment_id=0').get_json()
        self.assertTrue(all(c['segment_id'] == 0 for c in datos['customers']))
        self.assertEqual(datos['total'], len(datos['customers']))

    def test_customers_segmento_invalido(self):
        self.assertEqual(self.cliente.get('/api/v1/customers?segment_id=x').status_code, 400)

    def test_dashboard_summary(self):
        datos = self.cliente.get('/api/v1/dashboard/summary').get_json()
        self.assertEqual(datos['total_customers'], 200)
        self.assertEqual(round(sum(s['share_pct'] for s in datos['segments'])), 100)

    def test_404_en_json(self):
        r = self.cliente.get('/api/v1/no-existe')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.get_json()['error']['code'], 'not_found')

    def test_cors(self):
        r = self.cliente.get('/api/v1/health')
        self.assertIn('Access-Control-Allow-Origin', r.headers)


if __name__ == '__main__':
    unittest.main()
