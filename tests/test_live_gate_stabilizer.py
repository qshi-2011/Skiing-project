import unittest

from ski_racing.detection import LiveGateStabilizer


def _det(cx, by, conf=0.8, cls=0, name="gate"):
    return {
        "center_x": float(cx),
        "base_y": float(by),
        "confidence": float(conf),
        "class": int(cls),
        "class_name": str(name),
    }


class TestLiveGateStabilizer(unittest.TestCase):
    def test_empty_detections_do_not_return_stale_output(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )
        shown_first = stabilizer.update([_det(100, 200, conf=0.9)])
        self.assertEqual(len(shown_first), 1)

        shown_empty = stabilizer.update([])
        self.assertEqual(shown_empty, [])

    def test_min_hits_to_show_blocks_first_hit(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            min_hits_to_show=2,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )

        self.assertEqual(stabilizer.update([_det(100, 200, conf=0.9)]), [])
        shown_second = stabilizer.update([_det(102, 202, conf=0.9)])
        self.assertEqual(len(shown_second), 1)

    def test_spawn_conf_blocks_low_conf_track_creation(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )

        self.assertEqual(stabilizer.update([_det(100, 200, conf=0.2)]), [])
        shown_high_conf = stabilizer.update([_det(100, 200, conf=0.9)])
        self.assertEqual(len(shown_high_conf), 1)

    def test_unmatched_tracks_hidden_when_stale(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )

        shown = stabilizer.update([_det(100, 200, conf=0.9)])
        self.assertEqual(len(shown), 1)

        self.assertEqual(stabilizer.update([]), [])
        shown_after_match = stabilizer.update([_det(101, 201, conf=0.9)])
        self.assertEqual(len(shown_after_match), 1)

    def test_predict_only_step_does_not_increment_staleness(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )
        shown = stabilizer.step(10, [_det(100, 200, conf=0.9)])
        self.assertEqual(len(shown), 1)

        track_id = shown[0]["track_id"]
        stale_before = int(stabilizer._tracks[track_id]["stale_calls"])

        shown_predict_only = stabilizer.step(11, None)
        self.assertEqual(len(shown_predict_only), 1)
        self.assertEqual(int(stabilizer._tracks[track_id]["stale_calls"]), stale_before)

    def test_one_miss_inference_grace(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            max_shown_stale_calls=1,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )

        self.assertEqual(len(stabilizer.step(1, [_det(100, 200, conf=0.9)])), 1)
        self.assertEqual(len(stabilizer.step(2, [])), 1)
        self.assertEqual(stabilizer.step(3, []), [])

    def test_confidence_decays_on_inference_miss(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            max_shown_stale_calls=1,
            stale_conf_decay=0.5,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
        )

        shown = stabilizer.step(1, [_det(100, 200, conf=0.8)])
        self.assertEqual(len(shown), 1)
        track_id = shown[0]["track_id"]
        self.assertAlmostEqual(float(stabilizer._tracks[track_id]["confidence_ema"]), 0.8, places=6)

        stabilizer.step(2, [])
        self.assertAlmostEqual(float(stabilizer._tracks[track_id]["confidence_ema"]), 0.4, places=6)

    def test_order_independent_assignment(self):
        stabilizer = LiveGateStabilizer(
            show_stale=False,
            min_hits_to_show=1,
            spawn_conf=0.35,
            update_conf_min=0.15,
            display_conf=0.0,
            match_threshold=130.0,
            maha_threshold=3.0,
        )

        stabilizer.step(1, [_det(100, 200, conf=0.9), _det(300, 200, conf=0.9)])
        shown = stabilizer.step(2, [_det(295, 200, conf=0.9), _det(105, 200, conf=0.9)])
        self.assertEqual(len(shown), 2)
        self.assertIn(0, stabilizer._tracks)
        self.assertIn(1, stabilizer._tracks)

        x0 = float(stabilizer._tracks[0]["x"][0])
        x1 = float(stabilizer._tracks[1]["x"][0])

        self.assertLess(abs(x0 - 105.0), abs(x0 - 295.0))
        self.assertLess(abs(x1 - 295.0), abs(x1 - 105.0))


if __name__ == "__main__":
    unittest.main()
