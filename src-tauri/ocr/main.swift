// arkhive-ocr: the text in an image, for Arkhive's index. One image path per stdin line in, one line of text out
// (empty when there is no text or the image cannot be read). Uses Apple's Vision text recognizer.
import Foundation
import ImageIO
import Vision

setvbuf(stdout, nil, _IOLBF, 0)
while let path = readLine() {
    var text = ""
    let url = URL(fileURLWithPath: path) as CFURL
    if let source = CGImageSourceCreateWithURL(url, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        try? VNImageRequestHandler(cgImage: image).perform([request])
        text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    }
    print(text.replacingOccurrences(of: "\n", with: " "))
}
