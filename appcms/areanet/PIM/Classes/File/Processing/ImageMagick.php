<?php
namespace Areanet\PIM\Classes\File\Processing;

use Areanet\PIM\Classes\Config\Adapter;
use Areanet\PIM\Classes\File\ProcessingInterface;
use Areanet\PIM\Classes\File\BackendInterface;
use Areanet\PIM\Entity\File;
use Areanet\PIM\Entity\ThumbnailSetting;

class ImageMagick implements ProcessingInterface
{

    protected $thumbnailSettings = array();

    protected $mimeMapping = array(
        'image/jpeg' => 'jpeg',
        'image/jpg' => 'jpeg',
        'image/gif' => 'gif',
        'image/png' => 'png'
    );

    public function registerImageSize(ThumbnailSetting $thumbnailSetting)
    {
        $this->thumbnailSettings[$thumbnailSetting->getAlias()] = $thumbnailSetting;
    }

    public function getMimeTypes()
    {
        return array('image/jpeg', 'image/gif', 'image/png');
    }

    public function execute(BackendInterface $backend, File $fileObject, $fileSizeAlias = null, $variant = null)
    {

        if(!isset($this->mimeMapping[$fileObject->getType()])){
            return;
        }

        if($fileSizeAlias && !isset($this->thumbnailSettings[$fileSizeAlias])){
            throw new \Areanet\PIM\Classes\Exceptions\FileNotFoundException("FileSizeSetting not found");
        }

    
        $imExecutable   = Adapter::getConfig()->IMAGEMAGICK_EXECUTABLE;

        if (!is_executable($imExecutable)) {
            throw new \Exception("ImageMagick-Funktion $imExecutable nicht auf dem Server ausführbar.");
        }

        foreach($this->thumbnailSettings as $thumbnailSetting){

            if($fileSizeAlias && $fileSizeAlias != $thumbnailSetting->getAlias()){
                continue;
            }

            $imgName        = $backend->getPath($fileObject).'/'.$fileObject->getName();
            $imgThumbName   = $backend->getPath($fileObject).'/'.$thumbnailSetting->getAlias().'-'.$fileObject->getName();

            if($thumbnailSetting->getForceJpeg()){
                $imgThumbNameList = explode('.', $imgThumbName);
                $imgThumbNameList[(count($imgThumbNameList) -  1)] = 'jpg';
                $imgThumbName = implode('.', $imgThumbNameList);
            }

            if(!$variant || !file_exists($imgThumbName)) {
                $backgroundSetting = "";
                if ($thumbnailSetting->getBackgroundColor()) {
                    $backgroundSetting = '-background "' . $thumbnailSetting->getBackgroundColor() . '" -alpha remove ';
                }

                $convertSetting = "";
                if ($thumbnailSetting->getWidth() && $thumbnailSetting->getHeight()) {
                    if ($thumbnailSetting->getDoCut()) {
                        $convertSetting = '-thumbnail "' . $thumbnailSetting->getWidth() . 'x' . $thumbnailSetting->getHeight() . '^" -gravity center -extent "' . $thumbnailSetting->getWidth() . 'x' . $thumbnailSetting->getHeight() . '"';
                    } else {
                        $convertSetting = '-geometry "' . $thumbnailSetting->getWidth() . 'x' . $thumbnailSetting->getHeight() . '"';
                    }
                } elseif ($thumbnailSetting->getWidth()) {
                    $convertSetting = '-geometry "' . $thumbnailSetting->getWidth() . '"';
                } elseif ($thumbnailSetting->getHeight()) {
                    $convertSetting = '-geometry "x' . $thumbnailSetting->getHeight() . '"';
                } elseif ($thumbnailSetting->getPercent()) {
                    $convertSetting = '-geometry "' . $thumbnailSetting->getPercent() . '%"';
                }

                $quality = '-quality '.Adapter::getConfig()->FILE_IMAGE_QUALITY_JPEG;

                if($this->mimeMapping[$fileObject->getType()] == 'png'){
                    $quality = '-quality '.Adapter::getConfig()->FILE_IMAGE_QUALITY_PNG;
                }elseif($this->mimeMapping[$fileObject->getType()] == 'gif'){
                    $quality = '';
                }


                exec($imExecutable . ' +profile "*" -verbose ' . $convertSetting . $quality . ' -sharpen 1x2 -colorspace sRGB ' . $backgroundSetting . ' "' . $imgName . '" "' . $imgThumbName . '"');
            }


            if($thumbnailSetting->getIsResponsive() &&  $variant != '1x' || $variant == '2x' ) {
                $imgThumbNameList = explode("/", $imgThumbName);
                $imgThumbNameList[count($imgThumbNameList) - 1] = "2x@" . $imgThumbNameList[count($imgThumbNameList) - 1];
                $imgThumbName2x = implode('/', $imgThumbNameList);
                exec($imExecutable . ' +profile "*" -verbose -geometry "' . (2 / 3 * 100) . '%" "' . $imgThumbName . '" "' . $imgThumbName2x . '"');
            }

            if($thumbnailSetting->getIsResponsive() &&  $variant != '2x' || $variant == '1x') {

                $imgThumbNameList = explode("/", $imgThumbName);
                $imgThumbNameList[count($imgThumbNameList) - 1] = "1x@".$imgThumbNameList[count($imgThumbNameList) - 1];
                $imgThumbName1x = implode('/', $imgThumbNameList);
                exec($imExecutable.' +profile "*" -verbose -geometry "'.(1/3*100).'%" "'.$imgThumbName.'" "'.$imgThumbName1x.'"');
            }
        }
    }



}