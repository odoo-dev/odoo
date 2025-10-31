# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import logging
from datetime import datetime, timedelta

from odoo.tools import file_open

_logger = logging.getLogger(__name__)


def _devdata_post_init_hook(env):
    """This hook is executed after the module is installed."""
    _logger.info("Running devdata post-init hook...")

    demo_channel = env.ref("devdata.demo_call_channel", raise_if_not_found=False)
    if not demo_channel:
        _logger.warning("Could not find 'devdata.demo_call_history' record. Skipping artifact creation.")
        return

    if env['call.artifact'].search_count([('res_model', '=', 'discuss.call.history')]) >= 22:
        _logger.info("Demo artifacts already exist for 'devdata.demo_call_history'. Skipping creation.")
        return

    now = datetime.now()

    # =========================================================================
    # Call 1: with video, audio and transcript
    # =========================================================================
    call_1 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=30),
            "end_dt": now - timedelta(minutes=27, seconds=19),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_1.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info("Creating artifacts for call %s...", call_1.id)

        transcript = file_open("devdata/fixtures/transcript.srt").read()
        with file_open("devdata/fixtures/video.mp4", "rb") as video_file:
            video = base64.b64encode(video_file.read())
        with file_open("devdata/fixtures/audio.m4a", "rb") as audio_file:
            audio = base64.b64encode(audio_file.read())

        call_start = call_1.start_dt
        call_end = call_start + timedelta(minutes=2, seconds=41)

        env["call.artifact"].create(
            [
                {
                    "res_id": call_1.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": transcript,
                    "start": call_start,
                    "end": call_end,
                },
                {
                    "res_id": call_1.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "video",
                    "video": video,
                    "start": call_start,
                    "end": call_end,
                },
                {
                    "res_id": call_1.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "audio",
                    "audio": audio,
                    "start": call_start,
                    "end": call_end,
                },
            ]
        )

    # =========================================================================
    # Call 2: Partial recording and transcript
    # =========================================================================
    call_2 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=25),
            "end_dt": now - timedelta(minutes=23),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_2.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info("Creating partial artifacts for call %s...", call_2.id)

        call_start_2 = call_2.start_dt

        env["call.artifact"].create(
            [
                {
                    "res_id": call_2.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/transcript_from_10_to_20s.srt"
                    ).read(),
                    "start": call_start_2 + timedelta(seconds=10),
                    "end": call_start_2 + timedelta(seconds=20),
                },
                {
                    "res_id": call_2.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/transcript_from_60_to_100s.srt"
                    ).read(),
                    "start": call_start_2 + timedelta(seconds=60),
                    "end": call_start_2 + timedelta(seconds=100),
                },
                {
                    "res_id": call_2.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "audio",
                    "audio": base64.b64encode(
                        file_open(
                            "devdata/fixtures/audio_from_10_to_20s.m4a", "rb"
                        ).read()
                    ),
                    "start": call_start_2 + timedelta(seconds=10),
                    "end": call_start_2 + timedelta(seconds=20),
                },
                {
                    "res_id": call_2.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "audio",
                    "audio": base64.b64encode(
                        file_open(
                            "devdata/fixtures/audio_from_60_to_100s.m4a", "rb"
                        ).read()
                    ),
                    "start": call_start_2 + timedelta(seconds=60),
                    "end": call_start_2 + timedelta(seconds=100),
                },
            ]
        )

    # =========================================================================
    # Call 3: Overlapping artifacts
    # =========================================================================
    call_3 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(hours=1),
            "end_dt": now - timedelta(minutes=23, seconds=11),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_3.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info("Creating overlapping artifacts for call %s...", call_3.id)

        call_start_3 = call_3.start_dt

        env["call.artifact"].create(
            [
                {
                    "res_id": call_3.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/oxp/00_00-03_00.srt"
                    ).read(),
                    "start": call_start_3,
                    "end": call_start_3 + timedelta(minutes=3),
                },
                {
                    "res_id": call_3.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/oxp/15_00-15_30.srt"
                    ).read(),
                    "start": call_start_3 + timedelta(minutes=15),
                    "end": call_start_3 + timedelta(minutes=15, seconds=30),
                },
                {
                    "res_id": call_3.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/oxp/23_00-35_00.srt"
                    ).read(),
                    "start": call_start_3 + timedelta(minutes=23),
                    "end": call_start_3 + timedelta(minutes=35),
                },
            ]
        )

        env["call.artifact"].create(
            {
                "res_id": call_3.id,
                "res_model": "discuss.call.history",
                "artifact_type": "audio",
                "audio": base64.b64encode(
                    file_open(
                        "devdata/fixtures/oxp/audio_01-01_30_orig.m4a", "rb"
                    ).read()
                ),
                "start": call_start_3 + timedelta(minutes=1),
                "end": call_start_3 + timedelta(minutes=1, seconds=30),
            }
        )
        env["call.artifact"].create(
            {
                "res_id": call_3.id,
                "res_model": "discuss.call.history",
                "artifact_type": "audio",
                "audio": base64.b64encode(
                    file_open(
                        "devdata/fixtures/oxp/audio_05-07_low.m4a", "rb"
                    ).read()
                ),
                "start": call_start_3 + timedelta(minutes=5),
                "end": call_start_3 + timedelta(minutes=7),
            }
        )
        env["call.artifact"].create(
            {
                "res_id": call_3.id,
                "res_model": "discuss.call.history",
                "artifact_type": "audio",
                "audio": base64.b64encode(
                    file_open(
                        "devdata/fixtures/oxp/audio_06-07_orig.m4a", "rb"
                    ).read()
                ),
                "start": call_start_3 + timedelta(minutes=6),
                "end": call_start_3 + timedelta(minutes=7),
            }
        )
        env["call.artifact"].create(
            {
                "res_id": call_3.id,
                "res_model": "discuss.call.history",
                "artifact_type": "video",
                "video": base64.b64encode(
                    file_open(
                        "devdata/fixtures/oxp/video_02-02_30.mp4", "rb"
                    ).read()
                ),
                "start": call_start_3 + timedelta(minutes=2),
                "end": call_start_3 + timedelta(minutes=2, seconds=30),
            }
        )
        env["call.artifact"].create(
            {
                "res_id": call_3.id,
                "res_model": "discuss.call.history",
                "artifact_type": "video",
                "video": base64.b64encode(
                    file_open(
                        "devdata/fixtures/oxp/video_10-12_30_low.mp4", "rb"
                    ).read()
                ),
                "start": call_start_3 + timedelta(minutes=10),
                "end": call_start_3 + timedelta(minutes=12, seconds=30),
            }
        )
        env["call.artifact"].create(
            {
                "res_id": call_3.id,
                "res_model": "discuss.call.history",
                "artifact_type": "video",
                "video": base64.b64encode(
                    file_open(
                        "devdata/fixtures/oxp/video_11-13.mp4", "rb"
                    ).read()
                ),
                "start": call_start_3 + timedelta(minutes=11),
                "end": call_start_3 + timedelta(minutes=13),
            }
        )

    # =========================================================================
    # Call 4: Transcript only (aligned with call duration)
    # =========================================================================
    call_4 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=15),
            "end_dt": now - timedelta(minutes=12),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_4.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info(
            "Creating transcript-only artifact for call %s...", call_4.id
        )

        call_start_4 = call_4.start_dt
        # Call duration is 2 minutes; keep artifact within bounds
        env["call.artifact"].create(
            [
                {
                    "res_id": call_4.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/oxp/00_00-03_00.srt"
                    ).read(),
                    "start": call_start_4,
                    "end": call_start_4 + timedelta(minutes=2),
                },
            ]
        )

    # =========================================================================
    # Call 5: Short demo with a single artifact of each type
    # =========================================================================
    call_5 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=10),
            "end_dt": now - timedelta(minutes=7),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_5.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info("Creating single artifacts for call %s...", call_5.id)

        call_start_5 = call_5.start_dt

        with file_open("devdata/fixtures/simple/last_1min_video.mp4", "rb") as f:
            env["call.artifact"].create(
                {
                    "res_id": call_5.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "video",
                    "video": base64.b64encode(f.read()),
                    "start": call_start_5 + timedelta(minutes=2),
                    "end": call_start_5 + timedelta(minutes=3),
                }
            )

        with file_open(
            "devdata/fixtures/simple/audio_last3_to_last2.m4a", "rb"
        ) as f:
            env["call.artifact"].create(
                {
                    "res_id": call_5.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "audio",
                    "audio": base64.b64encode(f.read()),
                    "start": call_start_5,
                    "end": call_start_5 + timedelta(minutes=1),
                }
            )

        env["call.artifact"].create(
            [
                {
                    "res_id": call_5.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open(
                        "devdata/fixtures/simple/srt_33_36.srt"
                    ).read(),
                    "start": call_start_5,
                    "end": call_start_5 + timedelta(seconds=36),
                }
            ]
        )

    # =========================================================================
    # Call 6: Audio artifact only
    # =========================================================================
    call_6 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=9),
            "end_dt": now - timedelta(minutes=7),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_6.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info("Creating audio-only artifact for call %s...", call_6.id)

        call_start_6 = call_6.start_dt
        with file_open(
            "devdata/fixtures/simple/audio_last3_to_last2.m4a", "rb"
        ) as f:
            env["call.artifact"].create(
                {
                    "res_id": call_6.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "audio",
                    "audio": base64.b64encode(f.read()),
                    "start": call_start_6 + timedelta(seconds=30),
                    "end": call_start_6 + timedelta(
                        minutes=1, seconds=30
                    ),
                }
            )

    # =========================================================================
    # Call 7: Video artifact only
    # =========================================================================
    call_7 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=7),
            "end_dt": now - timedelta(minutes=4),
        }
    )

    if not env["call.artifact"].search(
        [
            ("res_id", "=", call_7.id),
            ("res_model", "=", "discuss.call.history"),
        ]
    ):
        _logger.info("Creating video-only artifact for call %s...", call_7.id)

        call_start_7 = call_7.start_dt
        with file_open("devdata/fixtures/simple/last_1min_video.mp4", "rb") as f:
            env["call.artifact"].create(
                {
                    "res_id": call_7.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "video",
                    "video": base64.b64encode(f.read()),
                    "start": call_start_7 + timedelta(seconds=10),
                    "end": call_start_7
                    + timedelta(minutes=1, seconds=10),
                }
            )
    # =========================================================================
    # Call 8: Call without artifacts
    # =========================================================================
    call_8 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=2),
            "end_dt": now - timedelta(minutes=1),
        }
    )

    # =========================================================================
    # Call 9: Call with non-srt transcript artifact without start/end
    # =========================================================================
    call_9 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": now - timedelta(minutes=5),
            "end_dt": now - timedelta(minutes=5) + timedelta(minutes=2, seconds=14),
        }
    )
    env["call.artifact"].create({
                    "res_id": call_9.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open("devdata/fixtures/non-srt-transcript.txt").read(),
    })

    # =========================================================================
    # Call 10: Call with two transcript artifacts: non-srt and srt
    # =========================================================================
    call_10_start = now - timedelta(minutes=5)
    call_10 = env["discuss.call.history"].create(
        {
            "channel_id": demo_channel.id,
            "start_dt": call_10_start,
            "end_dt": call_10_start + timedelta(minutes=5, seconds=18),
        }
    )
    env["call.artifact"].create({
                    "res_id": call_10.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": str(file_open("devdata/fixtures/non-srt-transcript.txt").read())*2,
    })
    env["call.artifact"].create(
            [
                {
                    "res_id": call_10.id,
                    "res_model": "discuss.call.history",
                    "artifact_type": "transcript",
                    "transcript": file_open("devdata/fixtures/oxp/00_00-03_00.srt").read(),
                    "start": call_10_start,
                    "end": call_10_start + timedelta(minutes=3),
                },
            ]
        )

    _logger.info("Successfully created demo artifacts.")
