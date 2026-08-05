import cv2
vidcap = cv2.VideoCapture('/Users/annie/seedance2/20260414-214536.mp4')
success,image = vidcap.read()
count = 0
while success:
  if count % 30 == 0:
    cv2.imwrite(f"/Users/annie/seedance2/frame_{count}.jpg", image)
  success,image = vidcap.read()
  count += 1
