"""
Datos estáticos de la simulación demo: pistas viales sobre calles reales de
Palenque, flota demo (DEMO_TAXIS*) y retratos por género.

Solo datos y funciones puras (sin acceso a DB). `server.py` los re-exporta.
"""
from typing import Dict

DEFAULT_SITIO = "default"  # mismo valor que server.DEFAULT_SITIO

# Pistas viales predeterminadas y únicas sobre las calles reales de Palenque, Chiapas (OSRM / OpenStreetMap)
# Pistas viales predeterminadas y únicas sobre las calles reales de Palenque, Chiapas (OSRM / OpenStreetMap)
PALENQUE_PISTAS_VIALES = {
    "pista_centro_juarez": {
        "id": "pista_centro_juarez",
        "nombre": "Pista Centro - Av. Juárez y Mercado",
        "sentido": "Circuito comercial centro (horario)",
        "doble_sentido": False,
        "distancia_m": 2113,
        "duracion_s": 287,
        "puntos": [
            [
                17.509556,
                -91.981798
            ],
            [
                17.509573,
                -91.982273
            ],
            [
                17.509952,
                -91.982282
            ],
            [
                17.510318,
                -91.982282
            ],
            [
                17.510696,
                -91.982282
            ],
            [
                17.511376,
                -91.982282
            ],
            [
                17.512326,
                -91.982281
            ],
            [
                17.512472,
                -91.983363
            ],
            [
                17.512527,
                -91.984504
            ],
            [
                17.512531,
                -91.984588
            ],
            [
                17.513102,
                -91.984585
            ],
            [
                17.513836,
                -91.984582
            ],
            [
                17.513906,
                -91.984581
            ],
            [
                17.513919,
                -91.985408
            ],
            [
                17.513922,
                -91.985601
            ],
            [
                17.51394,
                -91.986678
            ],
            [
                17.513872,
                -91.986683
            ],
            [
                17.513849,
                -91.985407
            ],
            [
                17.513836,
                -91.984582
            ],
            [
                17.513816,
                -91.983307
            ],
            [
                17.513268,
                -91.983329
            ],
            [
                17.512989,
                -91.98334
            ],
            [
                17.512472,
                -91.983363
            ],
            [
                17.511441,
                -91.983402
            ],
            [
                17.510755,
                -91.983429
            ],
            [
                17.510728,
                -91.982904
            ],
            [
                17.510696,
                -91.982282
            ],
            [
                17.510636,
                -91.981094
            ],
            [
                17.510269,
                -91.981137
            ],
            [
                17.509912,
                -91.981179
            ],
            [
                17.509535,
                -91.981223
            ],
            [
                17.509556,
                -91.981798
            ]
        ],
        "bearings_fwd": [
            272.1,
            358.7,
            0.0,
            0.0,
            0.0,
            0.1,
            278.1,
            272.9,
            272.9,
            0.3,
            0.2,
            0.8,
            270.9,
            270.9,
            271.0,
            184.0,
            91.1,
            90.9,
            90.9,
            182.2,
            182.2,
            182.4,
            182.1,
            182.1,
            93.1,
            93.1,
            93.0,
            186.4,
            186.4,
            186.4,
            272.2,
            272.2
        ]
    },
    "pista_canada_ado": {
        "id": "pista_canada_ado",
        "nombre": "Pista La Cañada - Corredor Hotelero - ADO",
        "sentido": "Circuito hotelero poniente",
        "doble_sentido": True,
        "distancia_m": 2976,
        "duracion_s": 352,
        "puntos": [
            [
                17.513922,
                -91.985601
            ],
            [
                17.51394,
                -91.986678
            ],
            [
                17.513872,
                -91.986683
            ],
            [
                17.513849,
                -91.985407
            ],
            [
                17.513836,
                -91.984582
            ],
            [
                17.513816,
                -91.983307
            ],
            [
                17.513769,
                -91.982281
            ],
            [
                17.513731,
                -91.981394
            ],
            [
                17.513645,
                -91.980383
            ],
            [
                17.513717,
                -91.980375
            ],
            [
                17.51413,
                -91.980313
            ],
            [
                17.514344,
                -91.980257
            ],
            [
                17.514558,
                -91.980158
            ],
            [
                17.514783,
                -91.979972
            ],
            [
                17.515082,
                -91.979701
            ],
            [
                17.516033,
                -91.978923
            ],
            [
                17.516147,
                -91.978923
            ],
            [
                17.51655,
                -91.9789
            ],
            [
                17.516734,
                -91.978871
            ],
            [
                17.517022,
                -91.978946
            ],
            [
                17.517676,
                -91.979121
            ],
            [
                17.517649,
                -91.979199
            ],
            [
                17.51672,
                -91.978981
            ],
            [
                17.516601,
                -91.979576
            ],
            [
                17.516601,
                -91.979576
            ],
            [
                17.51672,
                -91.978981
            ],
            [
                17.51655,
                -91.9789
            ],
            [
                17.516734,
                -91.978871
            ],
            [
                17.517022,
                -91.978946
            ],
            [
                17.51814,
                -91.979246
            ],
            [
                17.518711,
                -91.979399
            ],
            [
                17.518688,
                -91.979478
            ],
            [
                17.517649,
                -91.979199
            ],
            [
                17.516994,
                -91.979024
            ],
            [
                17.51672,
                -91.978981
            ],
            [
                17.51655,
                -91.9789
            ],
            [
                17.516033,
                -91.978923
            ],
            [
                17.515843,
                -91.979012
            ],
            [
                17.515082,
                -91.979701
            ],
            [
                17.514783,
                -91.979972
            ],
            [
                17.514558,
                -91.980158
            ],
            [
                17.514344,
                -91.980257
            ],
            [
                17.51413,
                -91.980313
            ],
            [
                17.513752,
                -91.980728
            ],
            [
                17.513808,
                -91.981402
            ],
            [
                17.513844,
                -91.982281
            ],
            [
                17.513886,
                -91.983306
            ],
            [
                17.513889,
                -91.983519
            ],
            [
                17.513906,
                -91.984581
            ],
            [
                17.513919,
                -91.985408
            ],
            [
                17.513922,
                -91.985601
            ]
        ],
        "bearings_fwd": [
            271.0,
            184.0,
            91.1,
            90.9,
            90.9,
            92.7,
            92.6,
            95.1,
            6.0,
            8.1,
            14.0,
            23.8,
            38.3,
            40.8,
            38.0,
            0.0,
            3.1,
            8.5,
            346.1,
            345.7,
            250.0,
            167.4,
            258.2,
            0.0,
            78.2,
            155.6,
            8.5,
            346.1,
            345.6,
            345.7,
            253.0,
            165.6,
            165.7,
            171.5,
            155.6,
            182.4,
            204.1,
            220.8,
            220.8,
            218.3,
            203.8,
            194.0,
            226.3,
            275.0,
            272.5,
            272.5,
            270.8,
            271.0,
            270.9,
            270.9,
            270.9
        ]
    },
    "pista_periferico_sur": {
        "id": "pista_periferico_sur",
        "nombre": "Pista Periférico Sur - Hospital General",
        "sentido": "Circuito hospitalario sur",
        "doble_sentido": True,
        "distancia_m": 2932,
        "duracion_s": 374,
        "puntos": [
            [
                17.504608,
                -91.974937
            ],
            [
                17.504675,
                -91.975063
            ],
            [
                17.504829,
                -91.976397
            ],
            [
                17.504351,
                -91.976461
            ],
            [
                17.504246,
                -91.97649
            ],
            [
                17.504218,
                -91.976512
            ],
            [
                17.504196,
                -91.976545
            ],
            [
                17.504177,
                -91.976598
            ],
            [
                17.504175,
                -91.976659
            ],
            [
                17.504238,
                -91.977246
            ],
            [
                17.504301,
                -91.977806
            ],
            [
                17.504401,
                -91.978706
            ],
            [
                17.504519,
                -91.979766
            ],
            [
                17.505202,
                -91.97969
            ],
            [
                17.505683,
                -91.979636
            ],
            [
                17.506431,
                -91.979552
            ],
            [
                17.506344,
                -91.97852
            ],
            [
                17.506286,
                -91.97799
            ],
            [
                17.506252,
                -91.977679
            ],
            [
                17.506889,
                -91.977638
            ],
            [
                17.507212,
                -91.977597
            ],
            [
                17.507558,
                -91.977556
            ],
            [
                17.507619,
                -91.978399
            ],
            [
                17.507693,
                -91.97941
            ],
            [
                17.507722,
                -91.980063
            ],
            [
                17.507742,
                -91.980503
            ],
            [
                17.507755,
                -91.980801
            ],
            [
                17.508338,
                -91.980746
            ],
            [
                17.508287,
                -91.979995
            ],
            [
                17.508242,
                -91.979349
            ],
            [
                17.508173,
                -91.978345
            ],
            [
                17.508101,
                -91.977489
            ],
            [
                17.508,
                -91.976502
            ],
            [
                17.50851,
                -91.976411
            ],
            [
                17.508559,
                -91.976994
            ],
            [
                17.508596,
                -91.977427
            ],
            [
                17.50868,
                -91.978297
            ],
            [
                17.508173,
                -91.978345
            ],
            [
                17.508101,
                -91.977489
            ],
            [
                17.508,
                -91.976502
            ],
            [
                17.507488,
                -91.976522
            ],
            [
                17.50715,
                -91.976504
            ],
            [
                17.50698,
                -91.976388
            ],
            [
                17.506662,
                -91.976215
            ],
            [
                17.505667,
                -91.975693
            ],
            [
                17.505175,
                -91.975444
            ],
            [
                17.504675,
                -91.975063
            ],
            [
                17.504608,
                -91.974937
            ]
        ],
        "bearings_fwd": [
            299.1,
            276.9,
            187.3,
            194.8,
            216.8,
            235.0,
            249.4,
            268.0,
            276.4,
            276.7,
            276.6,
            276.7,
            6.1,
            6.1,
            6.1,
            95.1,
            96.5,
            96.5,
            3.5,
            6.9,
            6.4,
            274.3,
            274.4,
            272.7,
            272.7,
            272.6,
            5.1,
            94.1,
            94.2,
            94.1,
            95.0,
            96.1,
            9.7,
            275.0,
            275.1,
            275.8,
            185.2,
            95.0,
            96.1,
            182.1,
            177.1,
            146.9,
            152.6,
            153.4,
            154.2,
            144.0,
            119.1,
            119.1
        ]
    },
    "pista_pakal_na": {
        "id": "pista_pakal_na",
        "nombre": "Pista Corredor Carretera Federal Pakal-Ná",
        "sentido": "Palenque a Pakal-Ná (doble sentido)",
        "doble_sentido": True,
        "distancia_m": 15414,
        "duracion_s": 1944,
        "puntos": [
            [
                17.518733,
                -91.977156
            ],
            [
                17.519426,
                -91.978515
            ],
            [
                17.518688,
                -91.979478
            ],
            [
                17.516033,
                -91.978923
            ],
            [
                17.513717,
                -91.980375
            ],
            [
                17.513344,
                -91.977029
            ],
            [
                17.513239,
                -91.975061
            ],
            [
                17.513527,
                -91.974046
            ],
            [
                17.513901,
                -91.973435
            ],
            [
                17.514804,
                -91.972955
            ],
            [
                17.515654,
                -91.972496
            ],
            [
                17.516476,
                -91.971788
            ],
            [
                17.51775,
                -91.970431
            ],
            [
                17.518659,
                -91.969731
            ],
            [
                17.519378,
                -91.96879
            ],
            [
                17.520439,
                -91.96861
            ],
            [
                17.519109,
                -91.969146
            ],
            [
                17.518128,
                -91.969931
            ],
            [
                17.517085,
                -91.970931
            ],
            [
                17.516302,
                -91.972189
            ],
            [
                17.515571,
                -91.972611
            ],
            [
                17.514258,
                -91.973152
            ],
            [
                17.513629,
                -91.973753
            ],
            [
                17.513501,
                -91.974581
            ],
            [
                17.513193,
                -91.975867
            ],
            [
                17.513521,
                -91.978612
            ],
            [
                17.514783,
                -91.979972
            ],
            [
                17.516734,
                -91.978871
            ],
            [
                17.519612,
                -91.979596
            ],
            [
                17.523787,
                -91.978329
            ],
            [
                17.526229,
                -91.97748
            ],
            [
                17.526232,
                -91.969076
            ],
            [
                17.538742,
                -91.965665
            ],
            [
                17.546602,
                -91.972585
            ],
            [
                17.54587,
                -91.975348
            ],
            [
                17.545707,
                -91.977303
            ],
            [
                17.544821,
                -91.983608
            ],
            [
                17.54644,
                -91.983758
            ],
            [
                17.548708,
                -91.984529
            ],
            [
                17.550787,
                -91.980928
            ],
            [
                17.549586,
                -91.974308
            ],
            [
                17.549598,
                -91.972827
            ],
            [
                17.550708,
                -91.972342
            ],
            [
                17.550277,
                -91.970642
            ],
            [
                17.548007,
                -91.968851
            ],
            [
                17.548139,
                -91.967186
            ],
            [
                17.54346,
                -91.964469
            ],
            [
                17.541271,
                -91.962234
            ],
            [
                17.539345,
                -91.959949
            ],
            [
                17.536583,
                -91.959997
            ],
            [
                17.535944,
                -91.959212
            ]
        ],
        "bearings_fwd": [
            298.1,
            231.2,
            168.7,
            210.9,
            96.7,
            93.2,
            73.4,
            57.3,
            26.9,
            27.2,
            39.4,
            45.4,
            36.3,
            51.3,
            9.2,
            201.0,
            217.3,
            222.4,
            236.9,
            208.8,
            201.5,
            222.3,
            260.8,
            255.9,
            277.1,
            314.2,
            28.3,
            346.5,
            16.1,
            18.3,
            90.0,
            14.6,
            320.0,
            254.5,
            265.0,
            261.6,
            355.0,
            342.0,
            58.8,
            100.8,
            89.5,
            22.6,
            104.9,
            143.0,
            85.2,
            151.0,
            135.8,
            131.5,
            180.9,
            130.5,
            130.5
        ]
    },
    "pista_carretera_ruinas": {
        "id": "pista_carretera_ruinas",
        "nombre": "Pista Carretera Zona Arqueológica - Misión Palenque",
        "sentido": "Centro a Ruinas (sur-poniente)",
        "doble_sentido": True,
        "distancia_m": 5797,
        "duracion_s": 618,
        "puntos": [
            [
                17.508,
                -91.983496
            ],
            [
                17.507349,
                -91.983498
            ],
            [
                17.506603,
                -91.983532
            ],
            [
                17.505915,
                -91.983564
            ],
            [
                17.504933,
                -91.983607
            ],
            [
                17.505094,
                -91.985116
            ],
            [
                17.505201,
                -91.986136
            ],
            [
                17.50443,
                -91.986217
            ],
            [
                17.504174,
                -91.986942
            ],
            [
                17.504116,
                -91.986976
            ],
            [
                17.50423,
                -91.988192
            ],
            [
                17.504989,
                -91.988116
            ],
            [
                17.50532,
                -91.987289
            ],
            [
                17.505217,
                -91.986288
            ],
            [
                17.505152,
                -91.985663
            ],
            [
                17.505036,
                -91.984574
            ],
            [
                17.50321,
                -91.983804
            ],
            [
                17.502265,
                -91.983912
            ],
            [
                17.501364,
                -91.984015
            ],
            [
                17.500454,
                -91.984119
            ],
            [
                17.499596,
                -91.984217
            ],
            [
                17.498721,
                -91.984316
            ],
            [
                17.496196,
                -91.984593
            ],
            [
                17.495542,
                -91.985994
            ],
            [
                17.495499,
                -91.986269
            ],
            [
                17.497474,
                -91.987707
            ],
            [
                17.49871,
                -91.988704
            ],
            [
                17.49962,
                -91.989848
            ],
            [
                17.500129,
                -91.990294
            ],
            [
                17.501044,
                -91.990657
            ],
            [
                17.502505,
                -91.991113
            ],
            [
                17.504615,
                -91.991786
            ],
            [
                17.504988,
                -91.991821
            ],
            [
                17.505095,
                -91.991861
            ],
            [
                17.505156,
                -91.991961
            ],
            [
                17.505145,
                -91.99208
            ],
            [
                17.505091,
                -91.992151
            ],
            [
                17.504814,
                -91.992435
            ],
            [
                17.504323,
                -91.993
            ],
            [
                17.503789,
                -91.993744
            ],
            [
                17.503625,
                -91.994149
            ],
            [
                17.503444,
                -91.995427
            ],
            [
                17.502002,
                -91.995556
            ],
            [
                17.500178,
                -91.995762
            ],
            [
                17.498942,
                -91.996003
            ],
            [
                17.497057,
                -91.996231
            ],
            [
                17.494442,
                -91.99661
            ],
            [
                17.493587,
                -91.996674
            ],
            [
                17.493524,
                -91.996205
            ],
            [
                17.493312,
                -91.994772
            ],
            [
                17.493247,
                -91.994351
            ]
        ],
        "bearings_fwd": [
            180.2,
            182.5,
            182.5,
            182.4,
            276.4,
            276.3,
            185.7,
            249.7,
            209.2,
            275.6,
            5.5,
            67.2,
            96.2,
            96.2,
            96.4,
            158.1,
            186.2,
            186.2,
            186.2,
            186.2,
            186.2,
            186.0,
            243.9,
            260.7,
            325.2,
            322.4,
            309.8,
            320.1,
            339.3,
            343.4,
            343.1,
            354.9,
            340.4,
            302.6,
            264.5,
            231.4,
            224.4,
            227.7,
            233.0,
            247.0,
            261.6,
            184.9,
            186.1,
            190.5,
            186.6,
            187.9,
            184.1,
            98.0,
            98.8,
            99.2,
            99.2
        ]
    },
    "pista_tren_maya": {
        "id": "pista_tren_maya",
        "nombre": "Pista Estación Tren Maya - Boulevard Aeropuerto",
        "sentido": "Acceso ferroviario y enlace libramiento",
        "doble_sentido": True,
        "distancia_m": 1135,
        "duracion_s": 191,
        "puntos": [
            [
                17.535944,
                -91.959212
            ],
            [
                17.536023,
                -91.958254
            ],
            [
                17.536161,
                -91.956843
            ],
            [
                17.536292,
                -91.955566
            ],
            [
                17.536363,
                -91.955341
            ],
            [
                17.536315,
                -91.955129
            ],
            [
                17.535683,
                -91.954027
            ],
            [
                17.535294,
                -91.953281
            ],
            [
                17.534785,
                -91.952345
            ],
            [
                17.534785,
                -91.952345
            ],
            [
                17.534724,
                -91.952147
            ],
            [
                17.534752,
                -91.951752
            ],
            [
                17.534882,
                -91.951414
            ],
            [
                17.535018,
                -91.951042
            ],
            [
                17.534895,
                -91.950851
            ],
            [
                17.535018,
                -91.951042
            ],
            [
                17.534882,
                -91.951414
            ],
            [
                17.534752,
                -91.951752
            ],
            [
                17.534724,
                -91.952147
            ],
            [
                17.534724,
                -91.952147
            ],
            [
                17.534785,
                -91.952345
            ],
            [
                17.534865,
                -91.952492
            ]
        ],
        "bearings_fwd": [
            85.1,
            84.1,
            83.9,
            71.7,
            103.4,
            121.0,
            118.7,
            119.7,
            0.0,
            107.9,
            85.7,
            68.0,
            69.0,
            124.0,
            304.0,
            249.0,
            248.0,
            265.7,
            0.0,
            287.9,
            299.7,
            299.7
        ]
    },
    "pista_foraneo_villahermosa": {
        "id": "pista_foraneo_villahermosa",
        "nombre": "Foráneo Villahermosa - Paseo Tabasco y Centro",
        "sentido": "Circuito urbano Villahermosa",
        "doble_sentido": True,
        "distancia_m": 1850,
        "duracion_s": 240,
        "puntos": [
            [17.9892, -92.9285],
            [17.9898, -92.9270],
            [17.9905, -92.9255],
            [17.9915, -92.9268],
            [17.9910, -92.9282],
            [17.9895, -92.9280]
        ]
    },
    "pista_foraneo_retorno_vhsa": {
        "id": "pista_foraneo_retorno_vhsa",
        "nombre": "Carretera Fed 186 - Retorno Villahermosa hacia Catazajá",
        "sentido": "Carretera federal dirección este hacia Chiapas",
        "doble_sentido": True,
        "distancia_m": 6200,
        "duracion_s": 320,
        "puntos": [
            [17.8520, -92.4500],
            [17.8480, -92.4350],
            [17.8450, -92.4200],
            [17.8410, -92.4050],
            [17.8380, -92.3900]
        ]
    },
    "pista_foraneo_catazaja_palenque": {
        "id": "pista_foraneo_catazaja_palenque",
        "nombre": "Carretera Fed 199 - Catazajá rumbo a Palenque",
        "sentido": "Carretera federal sur rumbo a Palenque",
        "doble_sentido": True,
        "distancia_m": 7100,
        "duracion_s": 360,
        "puntos": [
            [17.6500, -92.0020],
            [17.6350, -91.9980],
            [17.6200, -91.9950],
            [17.6050, -91.9910],
            [17.5900, -91.9880]
        ]
    },
    "pista_foraneo_playas_catazaja": {
        "id": "pista_foraneo_playas_catazaja",
        "nombre": "Playas de Catazajá - Centro y Malecón de la Laguna",
        "sentido": "Circuito local Playas de Catazajá",
        "doble_sentido": True,
        "distancia_m": 1600,
        "duracion_s": 220,
        "puntos": [
            [17.7285, -92.0165],
            [17.7295, -92.0150],
            [17.7275, -92.0135],
            [17.7260, -92.0155],
            [17.7270, -92.0175],
            [17.7285, -92.0165]
        ]
    }
}

DEMO_TAXIS = [
    {
        "usuario": "op1",
        "nombre": "Carlos Ramírez",
        "telefono": "916-200-0001",
        "placa": "TX-101",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Hidalgo hacia Parque Central (sentido único)",
        "lat": 17.509556,
        "lng": -91.981798,
        "gps_heading": 272.1
    },
    {
        "usuario": "op2",
        "nombre": "Ana Torres",
        "genero": "F",
        "telefono": "916-200-0002",
        "placa": "TX-102",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Gris",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Av. 20 de Noviembre hacia poniente (carril ADO-Cañada)",
        "lat": 17.513922,
        "lng": -91.985601,
        "gps_heading": 271.0
    },
    {
        "usuario": "op3",
        "nombre": "Luis Méndez",
        "telefono": "916-200-0003",
        "placa": "TX-103",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Rojo",
        "estado": "ocupado",
        "pista_id": "pista_carretera_ruinas",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Ruinas hacia Misión Palenque (carril sur-poniente)",
        "lat": 17.508,
        "lng": -91.983496,
        "gps_heading": 180.2
    },
    {
        "usuario": "op4",
        "nombre": "José Hernández",
        "telefono": "916-200-0004",
        "placa": "TX-104",
        "marca": "Nissan",
        "modelo": "Sentra",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Periférico Sur hacia Hospital General (carril poniente)",
        "lat": 17.504608,
        "lng": -91.974937,
        "gps_heading": 299.1
    },
    {
        "usuario": "op5",
        "nombre": "Roberto Morales",
        "telefono": "916-200-0005",
        "placa": "TX-105",
        "marca": "Volkswagen",
        "modelo": "Gol",
        "color": "Blanco",
        "estado": "asignado",
        "pista_id": "pista_canada_ado",
        "idx": 20,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Calzada La Cañada retornando hacia ADO (doble sentido, carril oriente)",
        "lat": 17.517676,
        "lng": -91.979121,
        "gps_heading": 70.0
    },
    {
        "usuario": "op6",
        "nombre": "Miguel Sánchez",
        "telefono": "916-200-0006",
        "placa": "TX-106",
        "marca": "Volkswagen",
        "modelo": "Virtus",
        "color": "Azul",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 10,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Juárez pasando Mercado Municipal (sentido único)",
        "lat": 17.513102,
        "lng": -91.984585,
        "gps_heading": 0.2
    },
    {
        "usuario": "op7",
        "nombre": "Jorge Albores",
        "telefono": "916-200-0007",
        "placa": "TX-107",
        "marca": "Chevrolet",
        "modelo": "Onix",
        "color": "Negro",
        "estado": "ocupado",
        "pista_id": "pista_carretera_ruinas",
        "idx": 25,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Ruinas retornando hacia La Cañada (doble sentido, carril nororiente)",
        "lat": 17.484,
        "lng": -92.046,
        "gps_heading": 30.0
    },
    {
        "usuario": "op8",
        "nombre": "David López",
        "telefono": "916-200-0008",
        "placa": "TX-108",
        "marca": "Volkswagen",
        "modelo": "Jetta",
        "color": "Blanco",
        "estado": "ocupado",
        "pista_id": "pista_pakal_na",
        "idx": 15,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Federal hacia Pakal-Ná (doble sentido, carril nororiente)",
        "lat": 17.525501,
        "lng": -91.958221,
        "gps_heading": 40.5
    },
    {
        "usuario": "op9",
        "nombre": "Pedro Gómez",
        "telefono": "916-200-0009",
        "placa": "TX-109",
        "marca": "Renault",
        "modelo": "Kwid",
        "color": "Naranja",
        "estado": "asignado",
        "pista_id": "pista_centro_juarez",
        "idx": 22,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Reforma hacia Bulevar Cabeza Maya (sentido único)",
        "lat": 17.51352,
        "lng": -91.98681,
        "gps_heading": 273.5
    },
    {
        "usuario": "op10",
        "nombre": "Alejandro Castro",
        "telefono": "916-200-0010",
        "placa": "TX-110",
        "marca": "Volkswagen",
        "modelo": "Golf",
        "color": "Rojo",
        "estado": "ocupado",
        "pista_id": "pista_tren_maya",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Boulevard de acceso hacia Estación Tren Maya (doble sentido)",
        "lat": 17.535944,
        "lng": -91.959212,
        "gps_heading": 85.1
    },
    {
        "usuario": "op11",
        "nombre": "Manuel Velasco",
        "telefono": "916-200-0011",
        "placa": "TX-111",
        "marca": "Nissan",
        "modelo": "March",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 24,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Hospital General retornando hacia Plaza Las Flores (doble sentido, carril oriente)",
        "lat": 17.507722,
        "lng": -91.980063,
        "gps_heading": 92.7
    },
    {
        "usuario": "op12",
        "nombre": "Alberto Castellanos",
        "telefono": "916-200-0012",
        "placa": "TX-112",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Azul",
        "estado": "ocupado",
        "pista_id": "pista_pakal_na",
        "idx": 35,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Federal retornando de Pakal-Ná hacia Palenque (doble sentido, carril sur-poniente)",
        "lat": 17.545707,
        "lng": -91.977303,
        "gps_heading": 81.6
    },
    {
        "usuario": "op13",
        "nombre": "Javier Mendoza",
        "telefono": "916-200-0013",
        "placa": "TX-113",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 38,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Calzada de los Empleados hacia La Cañada (doble sentido)",
        "lat": 17.515082,
        "lng": -91.979701,
        "gps_heading": 220.8
    },
    {
        "usuario": "op14",
        "nombre": "Daniel Morales",
        "telefono": "916-200-0014",
        "placa": "TX-114",
        "marca": "Nissan",
        "modelo": "Sentra",
        "color": "Gris",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 30,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Calle Abasolo hacia Parque Central (sentido único)",
        "lat": 17.509535,
        "lng": -91.981223,
        "gps_heading": 272.2
    },
    {
        "usuario": "op15",
        "nombre": "Oscar Trujillo",
        "telefono": "916-200-0015",
        "placa": "TX-115",
        "marca": "Estándar",
        "modelo": "Generico",
        "color": "Blanco",
        "estado": "fuera_de_servicio",
        "pista_id": "pista_centro_juarez",
        "idx": 15,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Base Poniente entrada vehicular (estacionado)",
        "lat": 17.51394,
        "lng": -91.986678,
        "gps_heading": 184.0
    },
    {
        "usuario": "op16",
        "nombre": "Fernando Solís",
        "telefono": "916-200-0016",
        "placa": "TX-116",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 5,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Juárez esquina Allende hacia ADO",
        "lat": 17.5108,
        "lng": -91.9838,
        "gps_heading": 2.0
    },
    {
        "usuario": "op17",
        "nombre": "Héctor Vázquez",
        "telefono": "916-200-0017",
        "placa": "TX-117",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 12,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Glorieta Cabeza Maya hacia Zona Hotelera La Cañada",
        "lat": 17.5158,
        "lng": -91.9822,
        "gps_heading": 68.0
    },
    {
        "usuario": "op18",
        "nombre": "Ricardo Domínguez",
        "telefono": "916-200-0018",
        "placa": "TX-118",
        "marca": "Nissan",
        "modelo": "Sentra",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 12,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Periférico Sur frente a Plaza Las Flores",
        "lat": 17.5062,
        "lng": -91.9785,
        "gps_heading": 285.0
    },
    {
        "usuario": "op19",
        "nombre": "Arturo Penagos",
        "telefono": "916-200-0019",
        "placa": "TX-119",
        "marca": "Volkswagen",
        "modelo": "Virtus",
        "color": "Gris",
        "estado": "libre",
        "pista_id": "pista_pakal_na",
        "idx": 8,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Bulevar Palenque-Pakal Ná frente a CFE",
        "lat": 17.5210,
        "lng": -91.9680,
        "gps_heading": 42.0
    },
    {
        "usuario": "op20",
        "nombre": "Gabriel Ocaña",
        "telefono": "916-200-0020",
        "placa": "TX-120",
        "marca": "Nissan",
        "modelo": "March",
        "color": "Rojo",
        "estado": "libre",
        "pista_id": "pista_tren_maya",
        "idx": 6,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Acceso Estación Tren Maya hacia Libramiento",
        "lat": 17.5355,
        "lng": -91.9545,
        "gps_heading": 295.0
    },
    {
        "usuario": "op21",
        "nombre": "Sergio Gordillo",
        "telefono": "916-200-0021",
        "placa": "TX-121",
        "marca": "Chevrolet",
        "modelo": "Onix",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_carretera_ruinas",
        "idx": 10,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera a las Ruinas frente a Hotel Chan-Kah",
        "lat": 17.5038,
        "lng": -91.9937,
        "gps_heading": 225.0
    },
    {
        "usuario": "op22",
        "nombre": "Raúl Bermúdez",
        "telefono": "916-200-0022",
        "placa": "TX-122",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 18,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. 5 de Mayo esquina Independencia",
        "lat": 17.5119,
        "lng": -91.9852,
        "gps_heading": 182.0
    },
    {
        "usuario": "op23",
        "nombre": "Ernesto Cameras",
        "telefono": "916-200-0023",
        "placa": "TX-123",
        "marca": "Volkswagen",
        "modelo": "Jetta",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 28,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Av. Merle Green en La Cañada",
        "lat": 17.5162,
        "lng": -91.9804,
        "gps_heading": 250.0
    },
    {
        "usuario": "op24",
        "nombre": "Víctor Mazariegos",
        "telefono": "916-200-0024",
        "placa": "TX-124",
        "marca": "Renault",
        "modelo": "Kwid",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 18,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Periférico Sur acceso a Hospital General",
        "lat": 17.5071,
        "lng": -91.9794,
        "gps_heading": 105.0
    },
    {
        "usuario": "op25",
        "nombre": "Marcos Orantes",
        "telefono": "916-200-0025",
        "placa": "TX-125",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Azul",
        "estado": "libre",
        "pista_id": "pista_pakal_na",
        "idx": 22,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Retorno Aeropuerto Antiguo hacia Centro",
        "lat": 17.5312,
        "lng": -91.9615,
        "gps_heading": 220.0
    },
]

DEMO_TAXIS_PAKALNA = [
    {
        "usuario": "pk1",
        "nombre": "Ramiro López (Pakal-Ná)",
        "telefono": "916-400-0201",
        "placa": "PK-201",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Verde",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_tren_maya",
        "idx": 2,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Estación Tren Maya Pakal-Ná",
        "lat": 17.5361,
        "lng": -91.9568,
        "gps_heading": 84.0
    },
    {
        "usuario": "pk2",
        "nombre": "Efraín Cruz (Pakal-Ná)",
        "telefono": "916-400-0202",
        "placa": "PK-202",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Blanco",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_pakal_na",
        "idx": 28,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Centro Pakal-Ná hacia Estación",
        "lat": 17.5385,
        "lng": -91.9690,
        "gps_heading": 45.0
    },
    {
        "usuario": "pk3",
        "nombre": "Noé Jiménez (Pakal-Ná)",
        "telefono": "916-400-0203",
        "placa": "PK-203",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "ocupado",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_tren_maya",
        "idx": 10,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Boulevard Tren Maya hacia Pakal-Ná",
        "lat": 17.5347,
        "lng": -91.9521,
        "gps_heading": 265.0
    },
    {
        "usuario": "pk4",
        "nombre": "Ulises Gómez (Pakal-Ná)",
        "telefono": "916-400-0204",
        "placa": "PK-204",
        "marca": "Volkswagen",
        "modelo": "Gol",
        "color": "Plata",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_pakal_na",
        "idx": 18,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Avenida Ferrocarril Pakal-Ná",
        "lat": 17.5280,
        "lng": -91.9605,
        "gps_heading": 215.0
    },
    {
        "usuario": "pk5",
        "nombre": "Tomás Aguilar (Pakal-Ná)",
        "telefono": "916-400-0205",
        "placa": "PK-205",
        "marca": "Nissan",
        "modelo": "March",
        "color": "Blanco",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_tren_maya",
        "idx": 14,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Glorieta Tren Maya Pakal-Ná",
        "lat": 17.5349,
        "lng": -91.9509,
        "gps_heading": 120.0
    },
]

DEMO_TAXIS_FORANEOS = [
    {
        "usuario": "for1",
        "nombre": "Roberto Méndez (Foráneo Vhsa)",
        "telefono": "993-200-0401",
        "placa": "TX-401",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Blanco",
        "estado": "ocupado",
        "sitio_id": DEFAULT_SITIO,
        "pista_id": "pista_foraneo_villahermosa",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Servicio Foráneo · Base Villahermosa, Tabasco",
        "lat": 17.9892,
        "lng": -92.9285,
        "gps_heading": 65.0,
        "es_foraneo": True,
        "destino_foraneo": "Villahermosa, Tabasco"
    },
    {
        "usuario": "for2",
        "nombre": "Mateo Morales (Retorno Vhsa-Catazajá)",
        "telefono": "993-200-0402",
        "placa": "TX-402",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Blanco",
        "estado": "ocupado",
        "sitio_id": DEFAULT_SITIO,
        "pista_id": "pista_foraneo_retorno_vhsa",
        "idx": 2,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Servicio Foráneo · Carretera Fed. 186 en retorno a Chiapas",
        "lat": 17.8450,
        "lng": -92.4200,
        "gps_heading": 115.0,
        "es_foraneo": True,
        "destino_foraneo": "En retorno hacia Catazajá"
    },
    {
        "usuario": "for3",
        "nombre": "Javier Hernández (Catazajá a Palenque)",
        "telefono": "916-200-0403",
        "placa": "TX-403",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "ocupado",
        "sitio_id": DEFAULT_SITIO,
        "pista_id": "pista_foraneo_catazaja_palenque",
        "idx": 2,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Servicio Foráneo · Carretera Fed. 199 rumbo a Palenque",
        "lat": 17.6200,
        "lng": -91.9950,
        "gps_heading": 175.0,
        "es_foraneo": True,
        "destino_foraneo": "Catazajá rumbo a Palenque"
    },
    {
        "usuario": "for4",
        "nombre": "Daniel Cruz (Base Catazajá)",
        "telefono": "916-200-0404",
        "placa": "TX-404",
        "marca": "Volkswagen",
        "modelo": "Vento",
        "color": "Blanco",
        "estado": "libre",
        "sitio_id": DEFAULT_SITIO,
        "pista_id": "pista_foraneo_playas_catazaja",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Servicio Foráneo · Base Playas de Catazajá, Chiapas",
        "lat": 17.7285,
        "lng": -92.0165,
        "gps_heading": 50.0,
        "es_foraneo": True,
        "destino_foraneo": "Playas de Catazajá, Chiapas"
    },
]

# Retratos de choferes demo (frontend/public/assets/drivers/driver-NN.jpg, fotos de
# stock de Pexels, ver CREDITS.md). Se asignan por género para que ningún chofer
# reciba la foto de una persona de otro género.
FOTOS_DEMO_HOMBRES = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
FOTOS_DEMO_MUJERES = [2, 16, 17]


def _foto_demo(n: int) -> str:
    return f"/assets/drivers/driver-{n:02d}.jpg"


def _fotos_demo_conductores() -> Dict[str, str]:
    """usuario → foto para todos los taxis demo, alternando dentro de cada género."""
    fotos, h, m = {}, 0, 0
    for t in DEMO_TAXIS + DEMO_TAXIS_PAKALNA + DEMO_TAXIS_FORANEOS:
        if t.get("genero") == "F":
            fotos[t["usuario"]] = _foto_demo(FOTOS_DEMO_MUJERES[m % len(FOTOS_DEMO_MUJERES)])
            m += 1
        else:
            fotos[t["usuario"]] = _foto_demo(FOTOS_DEMO_HOMBRES[h % len(FOTOS_DEMO_HOMBRES)])
            h += 1
    return fotos
