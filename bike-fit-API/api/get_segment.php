<?php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// --------------------------------------------------
// 設定ファイル
// --------------------------------------------------

$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {
    http_response_code(500);

    echo json_encode([
        "error" => "設定ファイル(config.php)が存在しません"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

$config = require $configFile;


// --------------------------------------------------
// 共通認証モジュール
// --------------------------------------------------

require_once __DIR__ . '/strava_auth.php';


// --------------------------------------------------
// Segment ID
// --------------------------------------------------

$segmentId = $_GET['id'] ?? '';

if (
    empty($segmentId) ||
    !ctype_digit($segmentId)
) {
    http_response_code(400);

    echo json_encode([
        "error" => "無効な Segment ID です"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// DB接続
// --------------------------------------------------

try {

    $pdo = new PDO(
        "mysql:host={$config['db']['host']};" .
        "dbname={$config['db']['name']};" .
        "charset=utf8mb4",

        $config['db']['user'],
        $config['db']['pass'],

        [
            PDO::ATTR_ERRMODE =>
                PDO::ERRMODE_EXCEPTION,

            PDO::ATTR_DEFAULT_FETCH_MODE =>
                PDO::FETCH_ASSOC,
        ]
    );

} catch (PDOException $e) {

    http_response_code(500);

    echo json_encode([
        "error" => "DB接続エラーが発生しました"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// ブラウザから渡されたコース名
// --------------------------------------------------

$courseName =
    $_GET['name'] ?? '';


// --------------------------------------------------
// DBキャッシュ確認
// --------------------------------------------------

$stmt = $pdo->prepare("
    SELECT
        name,
        strava_name,
        distance_km AS distanceKm,
        elevation_gain_m AS elevationGainM,
        average_grade AS averageGrade,
        maximum_grade AS maximumGrade
    FROM segments
    WHERE segment_id = :id
");

$stmt->execute([
    ':id' => $segmentId
]);

$cachedData = $stmt->fetch();

// --------------------------------------------------
// キャッシュがあれば返却
// --------------------------------------------------

if ($cachedData) {
    echo json_encode([
        'name' =>
            $courseName !== ''
                ? $courseName
                : $cachedData['name'],
        'stravaName' =>
            $cachedData['strava_name'] ?? '',
        'distanceKm' =>
            (float)$cachedData['distanceKm'],
        'elevationGainM' =>
            (int)$cachedData['elevationGainM'],
        'averageGrade' =>
            $cachedData['average_grade'] !== null
                ? (float)$cachedData['averageGrade']
                : null,
        'maximumGrade' =>
            $cachedData['maximum_grade'] !== null
                ? (float)$cachedData['maximumGrade']
                : null,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// --------------------------------------------------
// Stravaアクセストークン取得
// --------------------------------------------------

$accessToken =
    getValidAccessToken(
        $pdo,
        $config
    );

if (!$accessToken) {

    http_response_code(500);

    echo json_encode([
        "error" =>
            "アクセストークンの更新に失敗しました"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// Strava Segment API
// --------------------------------------------------

$url =
    "https://www.strava.com/api/v3/segments/" .
    $segmentId;

$ch = curl_init();

curl_setopt_array($ch, [

    CURLOPT_URL => $url,

    CURLOPT_RETURNTRANSFER => true,

    CURLOPT_SSL_VERIFYPEER => false,

    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " .
        $accessToken
    ],

]);

$response = curl_exec($ch);

$httpCode =
    curl_getinfo(
        $ch,
        CURLINFO_HTTP_CODE
    );

curl_close($ch);


// --------------------------------------------------
// Strava APIエラー
// --------------------------------------------------

if ($httpCode !== 200) {

    http_response_code($httpCode);

    echo json_encode([
        "error" =>
            "Strava APIからのデータ取得に失敗しました"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}


// --------------------------------------------------
// JSON解析
// --------------------------------------------------

$data = json_decode(
    $response,
    true
);


// --------------------------------------------------
// Stravaデータ
// --------------------------------------------------

$stravaName =
    $data['name'] ?? '';

$distanceKm =
    round(
        ($data['distance'] ?? 0) / 1000,
        2
    );

$elevationGainM =
    round(
        $data['total_elevation_gain'] ?? 0
    );

$averageGrade =
    isset($data['average_grade'])
        ? (float)$data['average_grade']
        : null;

$maximumGrade =
    isset($data['maximum_grade'])
        ? (float)$data['maximum_grade']
        : null;


// --------------------------------------------------
// DB保存
// --------------------------------------------------

try {

    $insertStmt = $pdo->prepare("

        INSERT INTO segments (
            segment_id,
            name,
            strava_name,
            distance_km,
            elevation_gain_m,
            average_grade,
            maximum_grade
        )

        VALUES (
            :id,
            :name,
            :strava_name,
            :dist,
            :elev,
            :average_grade,
            :maximum_grade
        )

    ");

    $insertStmt->execute([

        ':id' =>
            $segmentId,

        ':name' =>
            $courseName !== ''
                ? $courseName
                : $stravaName,

        ':strava_name' =>
            $stravaName,

        ':dist' =>
            $distanceKm,

        ':elev' =>
            $elevationGainM,

        ':average_grade' =>
            $averageGrade,

        ':maximum_grade' =>
            $maximumGrade,

    ]);

} catch (PDOException $e) {

    // キャッシュ保存失敗でもAPIレスポンスは返す
}


// --------------------------------------------------
// Angularへ返却
// --------------------------------------------------

echo json_encode([

    'name' =>
        $courseName !== ''
            ? $courseName
            : $stravaName,

    'stravaName' =>
        $stravaName,

    'distanceKm' =>
        $distanceKm,

    'elevationGainM' =>
        $elevationGainM,

    'averageGrade' =>
        $averageGrade,

    'maximumGrade' =>
        $maximumGrade,

], JSON_UNESCAPED_UNICODE);