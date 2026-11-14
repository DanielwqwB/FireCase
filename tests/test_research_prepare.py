import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).resolve().parents[1]/'scripts'/'prepare-research-data.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)
class ResearchPreparationTests(unittest.TestCase):
 def test_polygon_holes_and_outside_points(self):
  geometry={'type':'Polygon','coordinates':[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]]}
  self.assertTrue(prepare.in_boundary(2,2,geometry))
  self.assertFalse(prepare.in_boundary(5,5,geometry))
  self.assertFalse(prepare.in_boundary(12,2,geometry))
 def test_multipolygon_islands(self):
  geometry={'type':'MultiPolygon','coordinates':[[[[0,0],[2,0],[2,2],[0,2],[0,0]]],[[[5,5],[7,5],[7,7],[5,7],[5,5]]]]}
  self.assertTrue(prepare.in_boundary(6,6,geometry))
  self.assertFalse(prepare.in_boundary(4,4,geometry))
 def test_reject_nonfinite_values(self):
  for value in ['nan','inf','-inf']:
   with self.assertRaises(ValueError):prepare.finite(value)
if __name__=='__main__':unittest.main()
